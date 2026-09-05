import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { isClient } from "@/lib/rbac";
import { PLATFORM_LABELS } from "@/lib/constants";

// Mirrors the on-screen Campaign Report tab (CampaignReport.tsx) section for
// section — same numbers, same formulas — so the download always matches
// what's on screen. Sections 6 (growth graph) and 7 (sentiment) aren't
// buildable yet (no view-history table, no sentiment API), so they're
// omitted here too rather than faked.
function isInstagram(platform: string) {
  return platform.startsWith("INSTAGRAM");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      creators: { include: { deliverables: true }, where: { status: "ONBOARDED" }, orderBy: { createdAt: "asc" } },
      clientAccess: true,
    },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (isClient(user.role)) {
    const hasAccess = campaign.clientAccess.some((a) => a.userId === user.id);
    if (!hasAccess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const onboarding = campaign.creators;
  const allDeliverables = onboarding.flatMap((c) => c.deliverables);
  const liveRows = onboarding.flatMap((creator) =>
    creator.deliverables.filter((d) => Boolean(d.liveLink)).map((deliverable) => ({ creator, deliverable }))
  );

  // ---------- 2. Cost & delivery overview ----------
  const totalQuotedCost = onboarding.reduce((s, c) => s + (c.finalQuotedCost ?? 0), 0);
  const creatorsWithLiveContent = onboarding.filter((c) => c.deliverables.some((d) => Boolean(d.liveLink)));
  const costOfLiveContent = creatorsWithLiveContent.reduce((s, c) => s + (c.finalQuotedCost ?? 0), 0);
  const costPending = Math.max(0, totalQuotedCost - costOfLiveContent);
  const liveDeliverables = allDeliverables.filter((d) => Boolean(d.liveLink));

  // ---------- 3. Performance overview ----------
  const totalViews = liveRows.reduce((s, r) => s + (r.deliverable.views ?? 0), 0);
  const totalLikes = liveRows.reduce((s, r) => s + (r.deliverable.likes ?? 0), 0);
  const totalComments = liveRows.reduce((s, r) => s + (r.deliverable.comments ?? 0), 0);
  const totalShares = liveRows.reduce((s, r) => s + (isInstagram(r.deliverable.platform) ? r.deliverable.shares ?? 0 : 0), 0);
  const overallER = totalViews > 0 ? ((totalLikes + totalComments + totalShares) / totalViews) * 100 : 0;
  const blendedCPV = totalViews > 0 ? costOfLiveContent / totalViews : 0;

  // ---------- 4. Split by platform ----------
  const platforms = Array.from(new Set(allDeliverables.map((d) => d.platform)));
  const platformRows = platforms.map((platform) => {
    const allForPlatform = allDeliverables.filter((d) => d.platform === platform);
    const liveForPlatform = liveRows.filter((r) => r.deliverable.platform === platform);
    const views = liveForPlatform.reduce((s, r) => s + (r.deliverable.views ?? 0), 0);
    const likes = liveForPlatform.reduce((s, r) => s + (r.deliverable.likes ?? 0), 0);
    const comments = liveForPlatform.reduce((s, r) => s + (r.deliverable.comments ?? 0), 0);
    const shares = isInstagram(platform) ? liveForPlatform.reduce((s, r) => s + (r.deliverable.shares ?? 0), 0) : null;
    const er = views > 0 ? ((likes + comments + (shares ?? 0)) / views) * 100 : 0;
    const cost = liveForPlatform.reduce((s, r) => s + (r.creator.finalQuotedCost ?? 0), 0);
    const cpv = views > 0 ? cost / views : 0;
    return { label: PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS] ?? platform, total: allForPlatform.length, live: liveForPlatform.length, views, likes, comments, shares, er, cpv };
  });

  // ---------- 5. Live deliverables, ordered by live date ----------
  const sortedLiveRows = [...liveRows].sort((a, b) => {
    const da = a.deliverable.liveDate ? new Date(a.deliverable.liveDate).getTime() : 0;
    const db = b.deliverable.liveDate ? new Date(b.deliverable.liveDate).getTime() : 0;
    return da - db;
  });

  // ---------- 8. Spend band ----------
  const BANDS = [
    { label: "1k-10k", min: 1000, max: 10000 },
    { label: "10k-100k", min: 10000, max: 100000 },
    { label: "100k-500k", min: 100000, max: 500000 },
    { label: "500k-1M", min: 500000, max: 1000000 },
    { label: "1M+", min: 1000000, max: Infinity },
  ];
  function audienceSizeOf(c: (typeof onboarding)[number]): number {
    const isYoutube = c.platformPrimary?.startsWith("YOUTUBE");
    return (isYoutube ? c.youtubeSubscribers : c.followers) ?? c.followers ?? c.youtubeSubscribers ?? 0;
  }
  const spendBands = BANDS.map((band) => {
    const creatorsInBand = onboarding.filter((c) => {
      const size = audienceSizeOf(c);
      return size >= band.min && size < band.max;
    });
    const spend = creatorsInBand.reduce((s, c) => s + (c.finalQuotedCost ?? 0), 0);
    const views = creatorsInBand.reduce((s, c) => s + c.deliverables.filter((d) => Boolean(d.liveLink)).reduce((s2, d) => s2 + (d.views ?? 0), 0), 0);
    return { ...band, creators: creatorsInBand.length, spend, views, cpv: views > 0 ? spend / views : 0 };
  }).filter((b) => b.creators > 0);

  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const lines: string[] = [];
  const row = (cells: (string | number)[]) => lines.push(cells.map(csvEscape).join(","));

  lines.push(`Campaign Report - ${campaign.name} (${campaign.brand})`);
  lines.push(`Generated ${generatedAt}`);
  lines.push("");

  lines.push("1. Campaign header");
  row(["Brand", "Campaign Name", "Start Date", "Generated"]);
  row([campaign.brand, campaign.name, campaign.startDate ? new Date(campaign.startDate).toLocaleDateString("en-IN") : "-", generatedAt]);
  lines.push("");

  lines.push("2. Cost and delivery overview");
  row(["Total Quoted Cost", "Cost of Live Content", "Cost Pending", "Total Creators", "Total Deliverables", "Deliverables Live", "Deliverables Pending"]);
  row([totalQuotedCost, costOfLiveContent, costPending, onboarding.length, allDeliverables.length, liveDeliverables.length, allDeliverables.length - liveDeliverables.length]);
  lines.push("");

  lines.push("3. Performance overview, all live content");
  row(["Total Views", "Total Likes", "Total Comments", "Total Shares", "Overall ER%", "Blended CPV"]);
  row([totalViews, totalLikes, totalComments, totalShares, overallER.toFixed(1), blendedCPV.toFixed(2)]);
  lines.push("");

  lines.push("4. Split by platform and deliverable");
  row(["Format", "Deliverables", "Live", "Views", "Likes", "Comments", "Shares", "ER%", "CPV"]);
  for (const r of platformRows) {
    row([r.label, r.total, r.live, r.views, r.likes, r.comments, r.shares === null ? "n/a" : r.shares, r.er.toFixed(1), r.views > 0 ? r.cpv.toFixed(2) : "-"]);
  }
  row(["Total", allDeliverables.length, liveDeliverables.length, totalViews, totalLikes, totalComments, totalShares, overallER.toFixed(1), totalViews > 0 ? blendedCPV.toFixed(2) : "-"]);
  lines.push("");

  lines.push("5. Live deliverables, line item");
  row(["Creator", "Socials", "Deliverable", "Live Date", "Cost Paid", "Views", "Likes", "Comments", "Shares", "ER%", "CPV", "Live Link"]);
  for (const { creator, deliverable: d } of sortedLiveRows) {
    const shares = isInstagram(d.platform) ? d.shares ?? 0 : null;
    const er = d.views && d.views > 0 ? (((d.likes ?? 0) + (d.comments ?? 0) + (shares ?? 0)) / d.views) * 100 : 0;
    const cost = creator.finalQuotedCost ?? 0;
    const cpv = d.views && d.views > 0 ? cost / d.views : 0;
    const socialsHref = (isInstagram(d.platform) ? creator.profileUrl : creator.youtubeUrl) ?? "-";
    row([
      creator.name,
      socialsHref,
      d.title || (PLATFORM_LABELS[d.platform as keyof typeof PLATFORM_LABELS] ?? d.platform),
      d.liveDate ? new Date(d.liveDate).toLocaleDateString("en-IN") : "-",
      cost,
      d.views ?? 0,
      d.likes ?? 0,
      d.comments ?? 0,
      shares === null ? "n/a" : shares,
      er.toFixed(1),
      d.views && d.views > 0 ? cpv.toFixed(2) : "-",
      d.liveLink ?? "-",
    ]);
  }
  lines.push("");

  if (spendBands.length > 0) {
    lines.push("8. Spend band");
    row(["Follower Band", "Creators", "Spend", "Views", "CPV"]);
    for (const b of spendBands) {
      row([b.label, b.creators, b.spend, b.views, b.views > 0 ? b.cpv.toFixed(2) : "-"]);
    }
    lines.push("");
  }

  lines.push("Note: sections 6 (viewership growth graph) and 7 (comment sentiment) aren't available yet - both need infrastructure this panel doesn't have (a view-history table, a sentiment API).");

  const csv = lines.join("\n");
  const filename = `${campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.csv`;

  // UTF-8 BOM so Excel renders the rupee sign / special characters correctly
  // instead of the mangled "â€"" you get without it.
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(value: string | number) {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
