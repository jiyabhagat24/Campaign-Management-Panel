import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeInternalCost, campaignVisibilityWhere, isClient, canCreateCampaign } from "@/lib/rbac";
import Link from "next/link";
import { Plus } from "lucide-react";
import PortfolioDashboardClient, {
  type DashboardCampaignRow,
  type RecentActivityRow,
} from "@/components/dashboard/PortfolioDashboardClient";
import type { FinanceCampaignRow } from "@/components/finance/FinanceTableClient";
import { FINANCE_VISIBLE_STATUSES } from "@/lib/constants";
import type { RevenueDataRow } from "@/components/dashboard/RevenueBreakdownChart";

// Default onboard-to-go-live window, mirrors DEFAULT_GO_LIVE_DAYS in
// CreatorKanban.tsx and DEFAULT_SLA.onboardToGoLiveDays in constants.ts —
// used below to compute each onboarded creator's effective deadline when
// they don't have a per-creator override, same as the campaign page does.
const DEFAULT_GO_LIVE_DAYS = 15;
// A creator counts as "dormant" (an open flag) after this many hours with
// no logged activity against them or their deliverables — same threshold
// CreatorKanban's onboarding flag uses.
const DORMANT_HOURS = 48;

// Server shell: auth + data-fetching only. All filtering (Client, Campaign,
// Status, Date range, Brand Solutions, Campaign Manager — per the ops
// team's dashboard spec) happens client-side in PortfolioDashboardClient
// against the full campaign list handed to it below, so switching a filter
// is instant with no round trip. Recent Activity is a global feed, not
// scoped to the filters, same as before.
export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) return null;

  // activity here is only for computing "Open Flags" below (breached
  // deadline or 48h+ no action, per onboarded creator) — not the same
  // fetch as recentActivity further down, which is a separate global feed.
  const campaignInclude = {
    creators: { include: { deliverables: { select: { id: true, liveLink: true } } } },
    teamMembers: { include: { user: { select: { name: true } } } },
    activity: { select: { entityId: true, createdAt: true } },
  } as const;

  // Campaign visibility: clients see their own, CXO sees every campaign,
  // and every other internal role only sees campaigns they're assigned to.
  const campaigns = await prisma.campaign.findMany({
    where: campaignVisibilityWhere(user),
    include: campaignInclude,
    orderBy: { updatedAt: "desc" },
  });

  const rows: DashboardCampaignRow[] = campaigns.map((c) => {
    const brandSolutionsPoc = c.teamMembers.find((t) => t.roleOnCampaign === "BRAND_SOLUTIONS")?.user.name ?? null;
    const campaignManager = c.teamMembers.find((t) => t.roleOnCampaign === "CAMPAIGN_MANAGER")?.user.name ?? null;
    const deliverables = c.creators.flatMap((cr) => cr.deliverables);

    // Open Flags — same definition as the per-creator flag badge on the
    // campaign page's onboarding tab (CreatorKanban.tsx): an onboarded
    // creator counts as "open" if their go-live deadline has passed, or if
    // nothing's been logged against them (or their deliverables) in 48+
    // hours. Deadline-approaching-but-not-breached isn't counted here —
    // this column is meant to surface actual problems, not soft reminders.
    const now = Date.now();
    const openFlags = c.creators.filter((cr) => {
      if (cr.status !== "ONBOARDED") return false;

      const onboardedAt = cr.onboardedAt ? new Date(cr.onboardedAt) : null;
      const effectiveDeadline = cr.goLiveDeadline
        ? new Date(cr.goLiveDeadline)
        : onboardedAt
        ? new Date(onboardedAt.getTime() + DEFAULT_GO_LIVE_DAYS * 24 * 60 * 60 * 1000)
        : null;
      const deadlineBreached = effectiveDeadline ? now > effectiveDeadline.getTime() : false;

      const relevantIds = new Set([cr.id, ...cr.deliverables.map((d) => d.id)]);
      const lastActionAt = c.activity
        .filter((a) => relevantIds.has(a.entityId))
        .reduce<number | null>((latest, a) => {
          const t = new Date(a.createdAt).getTime();
          return latest === null || t > latest ? t : latest;
        }, null);
      const hoursSinceLastAction = lastActionAt !== null ? (now - lastActionAt) / (60 * 60 * 1000) : null;
      const dormant = hoursSinceLastAction !== null && hoursSinceLastAction >= DORMANT_HOURS;

      return deadlineBreached || dormant;
    }).length;

    return {
      id: c.id,
      name: c.name,
      brand: c.brand,
      brandLogoUrl: c.brandLogoUrl,
      status: c.status,
      budgetQuoted: c.budgetQuoted,
      goLiveDeadline: c.goLiveDeadline ? c.goLiveDeadline.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      brandSolutionsPoc,
      campaignManager,
      onboardedCount: c.creators.filter((cr) => cr.status === "ONBOARDED").length,
      deliverablesLive: deliverables.filter((d) => d.liveLink).length,
      deliverablesTotal: deliverables.length,
      // Only ONBOARDED creators are actually committed spend — a creator
      // still shortlisted, negotiating, or rejected has an internalCost
      // entered but nothing's actually been spent on them yet. Summing
      // every creator regardless of status (the old bug here) inflated
      // this into a number way bigger than what's actually locked in,
      // same mistake the Finance Table row below used to make. Matches
      // the ONBOARDED-only filter the campaign report CSV already uses.
      internalValue: c.creators.filter((cr) => cr.status === "ONBOARDED").reduce((s, cr) => s + (cr.internalCost ?? 0), 0),
      openFlags,
      financeYetToBeInvoiced: c.financeYetToBeInvoiced,
      financeYetToBeReceived: c.financeYetToBeReceived,
      financeValueOfClearedDue: c.financeValueOfClearedDue,
      financeCreatorPayablePending: c.financeCreatorPayablePending,
      financeAgencyFee: c.financeAgencyFee,
    };
  });

  // The sheet's "Finance Table" section — moved onto the dashboard itself
  // (per explicit instruction) rather than living only on the separate
  // /finance page, which now holds the same table for anyone who wants a
  // dedicated, less-crowded view of just this report. Built from the same
  // `campaigns` fetch above, no second query. Only ACTIVE/COMPLETED
  // campaigns show here — a paused or cancelled campaign's numbers
  // shouldn't appear in the live finance picture (FINANCE_VISIBLE_STATUSES).
  const financeRows: FinanceCampaignRow[] = campaigns
    .filter((c) => (FINANCE_VISIBLE_STATUSES as string[]).includes(c.status))
    .map((c) => {
    const brandSolutionsPoc = c.teamMembers.find((t) => t.roleOnCampaign === "BRAND_SOLUTIONS")?.user.name ?? null;
    return {
      id: c.id,
      name: c.name,
      brand: c.brand,
      brandLogoUrl: c.brandLogoUrl,
      brandSolutionsPoc,
      budgetQuoted: c.budgetQuoted,
      // Same ONBOARDED-only fix as the dashboard rows above.
      internalValue: c.creators.filter((cr) => cr.status === "ONBOARDED").reduce((s, cr) => s + (cr.internalCost ?? 0), 0),
      financeAgencyFee: c.financeAgencyFee,
      financeAgencyFeePercent: c.financeAgencyFeePercent,
      financeClientInvoiceStatus: c.financeClientInvoiceStatus,
      onboardedCreators: c.creators
        .filter((cr) => cr.status === "ONBOARDED" && cr.onboardedAt)
        .map((cr) => ({
          onboardedAt: cr.onboardedAt!.toISOString(),
          deliverableCount: cr.deliverables.length,
        })),
    };
  });
  const showFinance = !isClient(user.role) && canSeeInternalCost(user.role);

  // Revenue Breakdown Chart — one row per ONBOARDED creator with a real
  // onboarding date, quoted value split evenly across that campaign's
  // onboarded creators (no per-creator quoted value exists in the schema).
  // Same closure-date convention as the Finance Table above.
  const revenueRows: RevenueDataRow[] = campaigns.flatMap((c) => {
    const onboarded = c.creators.filter((cr) => cr.status === "ONBOARDED" && cr.onboardedAt);
    const perCreatorQuoted = onboarded.length > 0 ? (c.budgetQuoted ?? 0) / onboarded.length : 0;
    return onboarded.map((cr) => ({
      brand: c.brand,
      onboardedAt: cr.onboardedAt!.toISOString(),
      internalCost: cr.internalCost ?? 0,
      revenue: perCreatorQuoted,
    }));
  });

  const recentActivity: RecentActivityRow[] = isClient(user.role)
    ? []
    : (
        await prisma.activityLog.findMany({
          take: 8,
          orderBy: { createdAt: "desc" },
          include: { campaign: { select: { name: true } } },
        })
      ).map((a) => ({
        id: a.id,
        actorName: a.actorName,
        action: a.action,
        createdAt: a.createdAt.toISOString(),
        campaign: { name: a.campaign.name },
      }));

  const todayStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-6">
        <div>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{todayStr}</span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {user.name} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            All campaigns, every client, one screen.
          </p>
        </div>

        {canCreateCampaign(user.role) && (
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:from-indigo-700 hover:to-indigo-800 hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0"
          >
            <Plus className="h-4 w-4" />
            <span>New Campaign</span>
          </Link>
        )}
      </div>

      <PortfolioDashboardClient
        campaigns={rows}
        recentActivity={recentActivity}
        showRecentActivity={!isClient(user.role)}
        financeCampaigns={financeRows}
        showFinance={showFinance}
        revenueRows={revenueRows}
        isClientView={isClient(user.role)}
      />
    </div>
  );
}
