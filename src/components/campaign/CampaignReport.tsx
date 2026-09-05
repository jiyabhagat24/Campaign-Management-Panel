"use client";

import { ExternalLink, TrendingUp, MessageCircle } from "lucide-react";
import { PLATFORM_LABELS } from "@/lib/constants";
import type { Creator, Deliverable } from "@/components/campaign/CreatorKanban";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function num(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}
function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// Instagram's engagement formula counts shares; YouTube's API doesn't
// reliably expose shares, so YT engagement is likes+comments only — kept
// separate throughout rather than silently zero-filling shares into an ER
// number that would then be wrong.
function isInstagram(platform: string) {
  return platform.startsWith("INSTAGRAM");
}

type LiveRow = {
  creator: Creator;
  deliverable: Deliverable;
};

export default function CampaignReport({
  campaignName,
  campaignBrand,
  campaignStartDate,
  onboarding,
}: {
  campaignName: string;
  campaignBrand: string;
  campaignStartDate: string | Date | null;
  onboarding: Creator[];
}) {
  // ---------- 2. Cost & delivery overview ----------
  const totalQuotedCost = onboarding.reduce((sum, c) => sum + (c.finalQuotedCost ?? 0), 0);
  const creatorsWithLiveContent = onboarding.filter((c) => c.deliverables.some((d) => Boolean(d.liveLink)));
  const costOfLiveContent = creatorsWithLiveContent.reduce((sum, c) => sum + (c.finalQuotedCost ?? 0), 0);
  const costPending = Math.max(0, totalQuotedCost - costOfLiveContent);
  const allDeliverables = onboarding.flatMap((c) => c.deliverables);
  const liveDeliverables = allDeliverables.filter((d) => Boolean(d.liveLink));
  const pendingDeliverables = allDeliverables.length - liveDeliverables.length;

  // ---------- Live rows (used by 3, 4, 5) ----------
  const liveRows: LiveRow[] = onboarding.flatMap((creator) =>
    creator.deliverables.filter((d) => Boolean(d.liveLink)).map((deliverable) => ({ creator, deliverable }))
  );

  const lastUpdated = allDeliverables
    .map((d) => (d.lastTrackedAt ? new Date(d.lastTrackedAt) : null))
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  // ---------- 3. Performance overview, all live content ----------
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
    // Cost attributed to this format: each live deliverable in the format
    // carries its creator's full final cost — directional when one cost
    // covers several deliverables, exactly as documented in the brief.
    const cost = liveForPlatform.reduce((s, r) => s + (r.creator.finalQuotedCost ?? 0), 0);
    const cpv = views > 0 ? cost / views : 0;
    return {
      platform,
      label: PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS] ?? platform,
      total: allForPlatform.length,
      live: liveForPlatform.length,
      views,
      likes,
      comments,
      shares,
      er,
      cpv,
    };
  });

  // ---------- 5. Live deliverables line item, ordered by live date ----------
  const sortedLiveRows = [...liveRows].sort((a, b) => {
    const da = a.deliverable.liveDate ? new Date(a.deliverable.liveDate).getTime() : 0;
    const db = b.deliverable.liveDate ? new Date(b.deliverable.liveDate).getTime() : 0;
    return da - db;
  });

  // ---------- 8. Spend band ----------
  const BANDS = [
    { label: "1k – 10k", min: 1000, max: 10000 },
    { label: "10k – 100k", min: 10000, max: 100000 },
    { label: "100k – 500k", min: 100000, max: 500000 },
    { label: "500k – 1M", min: 500000, max: 1000000 },
    { label: "1M+", min: 1000000, max: Infinity },
  ];
  function audienceSizeOf(c: Creator): number {
    const isYoutube = c.platformPrimary?.startsWith("YOUTUBE");
    return (isYoutube ? c.youtubeSubscribers : c.followers) ?? c.followers ?? c.youtubeSubscribers ?? 0;
  }
  const spendBands = BANDS.map((band) => {
    const creatorsInBand = onboarding.filter((c) => {
      const size = audienceSizeOf(c);
      return size >= band.min && size < band.max;
    });
    const spend = creatorsInBand.reduce((s, c) => s + (c.finalQuotedCost ?? 0), 0);
    const views = creatorsInBand.reduce(
      (s, c) => s + c.deliverables.filter((d) => Boolean(d.liveLink)).reduce((s2, d) => s2 + (d.views ?? 0), 0),
      0
    );
    const cpv = views > 0 ? spend / views : 0;
    return { ...band, creators: creatorsInBand.length, spend, views, cpv };
  }).filter((b) => b.creators > 0);

  const sectionClass = "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900";
  const labelClass = "text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500";
  const valueClass = "mt-1 text-lg font-bold text-slate-900 dark:text-white";

  return (
    <div className="space-y-5">
      {/* 1. Campaign header */}
      <div className={sectionClass}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className={labelClass}>Brand</p>
            <p className={valueClass}>{campaignBrand}</p>
          </div>
          <div>
            <p className={labelClass}>Campaign Name</p>
            <p className={valueClass}>{campaignName}</p>
          </div>
          <div>
            <p className={labelClass}>Start Date</p>
            <p className={valueClass}>{campaignStartDate ? new Date(campaignStartDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p>
          </div>
          <div>
            <p className={labelClass}>Last Updated</p>
            <p className={valueClass}>{lastUpdated ? lastUpdated.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Not tracked yet"}</p>
          </div>
        </div>
      </div>

      {/* 2. Cost and delivery overview */}
      <div className={sectionClass}>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Cost &amp; Delivery Overview</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {[
            ["Total Quoted Cost", inr(totalQuotedCost)],
            ["Cost of Live Content", inr(costOfLiveContent)],
            ["Cost Pending", inr(costPending)],
            ["Total Creators", String(onboarding.length)],
            ["Total Deliverables", String(allDeliverables.length)],
            ["Deliverables Live", String(liveDeliverables.length)],
            ["Deliverables Pending", String(pendingDeliverables)],
          ].map(([label, value]) => (
            <div key={label}>
              <p className={labelClass}>{label}</p>
              <p className={valueClass}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Performance overview */}
      <div className={sectionClass}>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Performance Overview — All Live Content</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Total Views", num(totalViews)],
            ["Total Likes", num(totalLikes)],
            ["Total Comments", num(totalComments)],
            ["Total Shares", num(totalShares)],
            ["Overall ER", pct(overallER)],
            ["Blended CPV", inr(blendedCPV)],
          ].map(([label, value]) => (
            <div key={label}>
              <p className={labelClass}>{label}</p>
              <p className={valueClass}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Split by platform and deliverable */}
      <div className={`${sectionClass} overflow-hidden !p-0`}>
        <p className="px-5 pt-5 pb-3 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Split by Platform &amp; Deliverable</p>
        <div className="overflow-x-auto scrollbar-x-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-t border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                {["Format", "Deliverables", "Live", "Views", "Likes", "Comments", "Shares", "ER%", "CPV"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-5 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
              {platformRows.map((r) => (
                <tr key={r.platform}>
                  <td className="whitespace-nowrap px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">{r.label}</td>
                  <td className="px-5 py-3">{r.total}</td>
                  <td className="px-5 py-3">{r.live}</td>
                  <td className="px-5 py-3">{num(r.views)}</td>
                  <td className="px-5 py-3">{num(r.likes)}</td>
                  <td className="px-5 py-3">{num(r.comments)}</td>
                  <td className="px-5 py-3">{r.shares === null ? "n/a" : num(r.shares)}</td>
                  <td className="px-5 py-3">{pct(r.er)}</td>
                  <td className="px-5 py-3">{r.views > 0 ? inr(r.cpv) : "—"}</td>
                </tr>
              ))}
              {platformRows.length > 0 && (
                <tr className="bg-slate-50/60 dark:bg-slate-800/40 font-bold">
                  <td className="whitespace-nowrap px-5 py-3 text-slate-900 dark:text-white">Total</td>
                  <td className="px-5 py-3">{allDeliverables.length}</td>
                  <td className="px-5 py-3">{liveDeliverables.length}</td>
                  <td className="px-5 py-3">{num(totalViews)}</td>
                  <td className="px-5 py-3">{num(totalLikes)}</td>
                  <td className="px-5 py-3">{num(totalComments)}</td>
                  <td className="px-5 py-3">{num(totalShares)}</td>
                  <td className="px-5 py-3">{pct(overallER)}</td>
                  <td className="px-5 py-3">{totalViews > 0 ? inr(blendedCPV) : "—"}</td>
                </tr>
              )}
              {platformRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-xs text-slate-400 dark:text-slate-500">No deliverables yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Live deliverables, line item */}
      <div className={`${sectionClass} overflow-hidden !p-0`}>
        <p className="px-5 pt-5 pb-3 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Live Deliverables</p>
        <div className="overflow-x-auto scrollbar-x-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-t border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                {["Creator", "Socials", "Deliverable", "Live Date", "Cost Paid", "Views", "Likes", "Comments", "Shares", "ER%", "CPV"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-5 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
              {sortedLiveRows.map(({ creator, deliverable: d }) => {
                const shares = isInstagram(d.platform) ? d.shares ?? 0 : null;
                const er = d.views && d.views > 0 ? (((d.likes ?? 0) + (d.comments ?? 0) + (shares ?? 0)) / d.views) * 100 : 0;
                const cost = creator.finalQuotedCost ?? 0;
                const cpv = d.views && d.views > 0 ? cost / d.views : 0;
                const socialsHref = isInstagram(d.platform) ? creator.profileUrl : creator.youtubeUrl;
                return (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">{creator.name}</td>
                    <td className="px-5 py-3">
                      {socialsHref ? (
                        <a href={socialsHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400">
                          <span>{creator.channelHandle}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">{creator.channelHandle}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">{d.title || (PLATFORM_LABELS[d.platform as keyof typeof PLATFORM_LABELS] ?? d.platform)}</td>
                    <td className="whitespace-nowrap px-5 py-3">{d.liveDate ? new Date(d.liveDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3">{inr(cost)}</td>
                    <td className="px-5 py-3">{num(d.views ?? 0)}</td>
                    <td className="px-5 py-3">{num(d.likes ?? 0)}</td>
                    <td className="px-5 py-3">{num(d.comments ?? 0)}</td>
                    <td className="px-5 py-3">{shares === null ? "n/a" : num(shares)}</td>
                    <td className="px-5 py-3">{pct(er)}</td>
                    <td className="px-5 py-3">
                      {d.liveLink ? (
                        <a href={d.liveLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400">
                          <span>{d.views && d.views > 0 ? inr(cpv) : "—"}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        d.views && d.views > 0 ? inr(cpv) : "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              {sortedLiveRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-8 text-center text-xs text-slate-400 dark:text-slate-500">No content is live yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6 & 7 — not built yet: need new infra (view-history table for the
          graph, a comment-sentiment API integration). Honest placeholder
          instead of fake numbers. */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className={`${sectionClass} flex flex-col items-center justify-center text-center py-8`}>
          <TrendingUp className="h-6 w-6 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Viewership Growth Graph</p>
          <p className="mt-1 max-w-xs text-[11px] text-slate-400 dark:text-slate-500">
            Not available yet — needs a view-history table that snapshots each deliverable's numbers over time. Currently only the latest count is stored.
          </p>
        </div>
        <div className={`${sectionClass} flex flex-col items-center justify-center text-center py-8`}>
          <MessageCircle className="h-6 w-6 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Comment Sentiment</p>
          <p className="mt-1 max-w-xs text-[11px] text-slate-400 dark:text-slate-500">
            Not available yet — needs a third-party comment-scraping / sentiment API connected.
          </p>
        </div>
      </div>

      {/* 8. Spend band */}
      {spendBands.length > 0 && (
        <div className={`${sectionClass} overflow-hidden !p-0`}>
          <p className="px-5 pt-5 pb-3 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Spend Band</p>
          <div className="overflow-x-auto scrollbar-x-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-t border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  {["Follower Band", "Creators", "Spend", "Views", "CPV"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-5 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
                {spendBands.map((b) => (
                  <tr key={b.label}>
                    <td className="whitespace-nowrap px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">{b.label}</td>
                    <td className="px-5 py-3">{b.creators}</td>
                    <td className="px-5 py-3">{inr(b.spend)}</td>
                    <td className="px-5 py-3">{num(b.views)}</td>
                    <td className="px-5 py-3">{b.views > 0 ? inr(b.cpv) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
