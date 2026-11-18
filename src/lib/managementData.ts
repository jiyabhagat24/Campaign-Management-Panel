// Shared data helpers for the management home pages (sandbox audit, Phase 2).
// Read-only. Every number on the C-suite and IR Manager homes comes from one
// of these functions, so the two pages can't define the same metric twice.

import { prisma } from "@/lib/prisma";
import { effectiveDeadlineMs } from "@/lib/irDashboard";

export const DAY_MS = 24 * 60 * 60 * 1000;

export const scopeCampaignSelect = {
  id: true,
  name: true,
  brand: true,
  status: true,
  goLiveDeadline: true,
  createdAt: true,
  teamMembers: { select: { userId: true, roleOnCampaign: true, user: { select: { name: true } } } },
  creators: {
    select: {
      id: true,
      name: true,
      status: true,
      onboardedAt: true,
      goLiveDeadline: true,
      ballOwner: true,
      sourcedByUserId: true,
      pocUserId: true,
      internalCost: true,
      quotedCost: true,
      finalQuotedCost: true,
      payoutPaymentStatus: true,
      deliverables: {
        select: { id: true, platform: true, scriptStatus: true, contentStatus: true, liveLink: true, liveDate: true, views: true },
      },
    },
  },
} as const;

export type ScopeCampaign = Awaited<ReturnType<typeof loadCampaigns>>[number];

export async function loadCampaigns(where: object) {
  return prisma.campaign.findMany({ where, select: scopeCampaignSelect, orderBy: { updatedAt: "desc" } });
}

type Del = { scriptStatus: string | null; contentStatus: string | null; liveLink: string | null };

// Same four buckets as the sandbox's "Execution snapshot".
export function executionSnapshot(dels: Del[]) {
  let script = 0, video = 0, ready = 0, live = 0;
  for (const d of dels) {
    if (d.liveLink) live++;
    else if (d.contentStatus === "APPROVED") ready++;
    else if (d.contentStatus) video++;
    else script++;
  }
  return { script, video, ready, live, total: dels.length };
}

export function quotedOf(cr: { finalQuotedCost: number | null; quotedCost: number | null }) {
  return cr.finalQuotedCost ?? cr.quotedCost ?? 0;
}

export function isCreatorDelayed(
  cr: { status: string; goLiveDeadline: Date | null; onboardedAt: Date | null; deliverables: { liveLink: string | null }[] },
  now: number
) {
  if (cr.status !== "ONBOARDED") return false;
  const deadline = effectiveDeadlineMs(cr);
  const allLive = cr.deliverables.length > 0 && cr.deliverables.every((d) => d.liveLink);
  return deadline !== null && deadline < now && !allLive;
}

export function cmName(c: ScopeCampaign) {
  return c.teamMembers.find((t) => t.roleOnCampaign === "CAMPAIGN_MANAGER")?.user.name ?? null;
}

// A campaign is "at risk" for a stated reason, never a bare colour.
export function riskReasons(c: ScopeCampaign, now: number, highEscalations: number) {
  const reasons: string[] = [];
  const delayed = c.creators.filter((cr) => isCreatorDelayed(cr, now));
  if (delayed.length) reasons.push(`${delayed.length} creator${delayed.length === 1 ? "" : "s"} past go-live`);
  const dels = c.creators.filter((cr) => cr.status === "ONBOARDED").flatMap((cr) => cr.deliverables);
  if (c.goLiveDeadline && c.goLiveDeadline.getTime() < now && dels.some((d) => !d.liveLink)) reasons.push("campaign go-live date passed");
  if (highEscalations) reasons.push(`${highEscalations} high escalation${highEscalations === 1 ? "" : "s"}`);
  const waitingClient = c.creators.filter((cr) => cr.status === "ONBOARDED" && cr.ballOwner === "CLIENT" && cr.deliverables.some((d) => !d.liveLink)).length;
  if (waitingClient >= 2) reasons.push(`${waitingClient} creators waiting on client`);
  return reasons;
}

// Creator payment pipeline. Prefers the new invoice/payout tables; if they
// hold nothing yet (or don't exist), falls back to the existing payout flags.
export async function creatorPaymentPipeline(campaignIds: string[], campaigns: ScopeCampaign[], now: number) {
  try {
    const invoices: { amount: number; status: string; dueDate: Date | null; payouts: { amount: number }[] }[] = await (prisma as any).creatorInvoice.findMany({
      where: { campaignId: { in: campaignIds }, status: { not: "REJECTED" } },
      select: { amount: true, status: true, dueDate: true, payouts: { select: { amount: true } } },
    });
    if (invoices.length) {
      let invoiced = 0, paid = 0, due = 0;
      for (const inv of invoices) {
        const p = inv.payouts.reduce((s, x) => s + x.amount, 0);
        invoiced += inv.amount;
        paid += p;
        if (inv.dueDate && inv.dueDate.getTime() <= now) due += Math.max(inv.amount - p, 0);
      }
      return { source: "ledger" as const, invoiced, paid, unpaid: invoiced - paid, due };
    }
  } catch {
    /* tables not created yet */
  }
  const onboarded = campaigns.flatMap((c) => c.creators.filter((cr) => cr.status === "ONBOARDED"));
  const committed = onboarded.reduce((s, cr) => s + (cr.internalCost ?? 0), 0);
  const unpaid = onboarded.filter((cr) => cr.payoutPaymentStatus !== "PAID").reduce((s, cr) => s + (cr.internalCost ?? 0), 0);
  return { source: "flags" as const, invoiced: committed, paid: committed - unpaid, unpaid, due: null as number | null };
}

// Upcoming unpaid milestones in the next `days` (new tables only).
export async function upcomingMilestoneExposure(creatorIds: string[], now: number, days = 14) {
  try {
    const ms: { amount: number; dueDate: Date | null; payouts: { amount: number }[] }[] = await (prisma as any).paymentMilestone.findMany({
      where: { creatorId: { in: creatorIds }, dueDate: { lte: new Date(now + days * DAY_MS) } },
      select: { amount: true, dueDate: true, payouts: { select: { amount: true } } },
    });
    return ms.reduce((s, m) => s + Math.max(m.amount - m.payouts.reduce((a, p) => a + p.amount, 0), 0), 0);
  } catch {
    return null;
  }
}

// Gate G12 (workflow spec): finance figures stay provisional until the CXO
// locks the month. Returns the set of locked "YYYY-MM" keys.
export async function lockedMonthKeys() {
  const rows = await prisma.month.findMany({ where: { status: "LOCKED" }, select: { month: true } });
  return new Set(rows.map((r) => r.month));
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function lastMonths(n: number, now = new Date()) {
  const out: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(d), label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) });
  }
  return out;
}

// Open escalations in a set of campaigns (gap build), for the role homes'
// "Open escalations" card. Escalation rows are visible to any internal role
// on the campaign (spec Page Permissions, Escalations).
export async function openEscalationItems(campaignIds: string[], nameOf: Map<string, string>, now = Date.now()) {
  if (!campaignIds.length) return [];
  const rows = await prisma.escalation.findMany({
    where: { campaignId: { in: campaignIds }, status: { not: "CLOSED" } },
    select: { id: true, title: true, severity: true, status: true, sitsAt: true, campaignId: true, createdAt: true, owner: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const rank = (s: string) => (s === "HIGH" ? 0 : s === "MEDIUM" ? 1 : 2);
  return rows
    .sort((a, b) => rank(a.severity) - rank(b.severity))
    .map((e) => {
      const age = Math.floor((now - e.createdAt.getTime()) / DAY_MS);
      return {
        tone: e.severity === "HIGH" || age > 7 ? ("high" as const) : ("medium" as const),
        title: `${e.title} · ${nameOf.get(e.campaignId) ?? ""}`,
        reason: `${e.severity.toLowerCase()} · sits at ${e.sitsAt.toLowerCase()} · ${e.owner?.name ? `owner ${e.owner.name}` : "no owner yet"} · open ${age}d`,
        href: "/escalations",
      };
    });
}
