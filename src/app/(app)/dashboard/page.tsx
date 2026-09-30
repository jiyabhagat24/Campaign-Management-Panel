import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeInternalCost, campaignVisibilityWhere, isClient, canCreateCampaign, isSuperAdmin } from "@/lib/rbac";
import Link from "next/link";
import { Plus } from "lucide-react";
import PortfolioDashboardClient, {
  type DashboardCampaignRow,
  type RecentActivityRow,
} from "@/components/dashboard/PortfolioDashboardClient";
import type { FinanceCampaignRow } from "@/components/finance/FinanceTableClient";
import { FINANCE_VISIBLE_STATUSES } from "@/lib/constants";
import type { RevenueDataRow } from "@/components/dashboard/RevenueBreakdownChart";
import IrExecutivePersonalDashboard, {
  type IrExecutiveDashboardData,
} from "@/components/dashboard/IrExecutivePersonalDashboard";
import { formatCompactINR } from "@/lib/format";

// "2d 4h" — same duration format as the IR Executive dashboard's turnaround
// table, used here for the plain-text value on each row of a turnaround
// detail list (e.g. "Onboarding to script approval" expanded).
function formatDurationForDetail(ms: number): string {
  const totalHours = Math.round(ms / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days === 0 ? `${hours}h` : `${days}d ${hours}h`;
}

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
  // Page Permissions matrix: Dashboard is Not available (RED) for Client —
  // must not render, not just show a reduced view. Clients land on
  // /campaigns instead, which the matrix does grant them.
  if (isClient(user.role) && !isSuperAdmin(user.id)) redirect("/campaigns");

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

  // Section B's actual per-invoice ledger (the campaign's own Finance and
  // Invoicing tab / Client Cash) — the real system of record for what's
  // been invoiced and received from the client. Fetched as its own query
  // rather than an include on campaign.findMany above, same as
  // campaigns/[id]/page.tsx already does, since the ClientInvoice relation
  // isn't in the locally generated Prisma client yet (no network to
  // Prisma's binary host in this sandbox — see the `as any` cast below;
  // Vercel's postinstall regenerates the real client at deploy time).
  const clientInvoiceRows = await (prisma as any).clientInvoice.findMany({
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
    select: { campaignId: true, invoiceAmount: true, amountReceived: true },
  }) as { campaignId: string; invoiceAmount: number; amountReceived: number | null }[];
  const invoicesByCampaign = new Map<string, { invoiceAmount: number; amountReceived: number | null }[]>();
  for (const inv of clientInvoiceRows) {
    const list = invoicesByCampaign.get(inv.campaignId) ?? [];
    list.push(inv);
    invoicesByCampaign.set(inv.campaignId, list);
  }

  // Computed up front (was previously computed further down, after rows/
  // financeRows/revenueRows already existed) so every cost-derived number
  // below can be zeroed out for whoever shouldn't see it, rather than
  // computed in full and merely left unrendered. PortfolioDashboardClient
  // is a Client Component, so any real number handed to it as a prop is
  // serialized into the page's own payload and reaches the browser
  // regardless of whether the JSX conditionally renders it — "hidden in
  // the UI" is not "never sent". Client and IR Intern are excluded from
  // INTERNAL_COST_ROLES, so this keeps internal cost out of their browser
  // entirely, not just off their screen.
  const showFinance = !isClient(user.role) && canSeeInternalCost(user.role);

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

    const onboardedCreators = c.creators.filter((cr) => cr.status === "ONBOARDED");
    // Delayed/On Time — per CREATOR, not per campaign: a campaign's own
    // goLiveDeadline is one optional top-level estimate, but each onboarded
    // creator has their own effective deadline (same fallback as openFlags
    // above), and a single campaign commonly has some creators overdue and
    // others not. Counting whole campaigns as "delayed" the moment any one
    // creator slips was overstating the problem (and understating "on
    // time"); this sums actual overdue creators instead.
    const delayedCreatorsCount = onboardedCreators.filter((cr) => {
      const onboardedAt = cr.onboardedAt ? new Date(cr.onboardedAt) : null;
      const effectiveDeadline = cr.goLiveDeadline
        ? new Date(cr.goLiveDeadline)
        : onboardedAt
        ? new Date(onboardedAt.getTime() + DEFAULT_GO_LIVE_DAYS * 24 * 60 * 60 * 1000)
        : null;
      return effectiveDeadline ? now > effectiveDeadline.getTime() : false;
    }).length;
    // "Quoted value" for Total Active Value / margin — each onboarded
    // creator's own Final Quoted Cost (falling back to Quoted Cost), same
    // convention as the Revenue Breakdown Chart. NOT Campaign.budgetQuoted:
    // that's an optional top-level estimate that's frequently left unset,
    // which was silently zeroing out Total Active Value and Margin %
    // whenever it was null even though real per-creator costing existed.
    const quotedValue = onboardedCreators.reduce((s, cr) => s + (cr.finalQuotedCost ?? cr.quotedCost ?? 0), 0);
    // Yet to be Invoiced / Yet to be Received / Value of Cleared Due —
    // derived from the campaign's actual ClientInvoice ledger (Section B /
    // Client Cash), not the older financeClientInvoiceStatus dropdown on
    // FinanceRow. That single NOT_INVOICED/INVOICED/PAID field predates the
    // per-invoice ledger built for "invoiced 3 times against one closed
    // cost" campaigns — once a campaign has real invoice rows logged, its
    // three actual amounts (invoiced so far, received so far, still
    // outstanding) diverge from what that one dropdown alone could ever
    // represent, and it's easy to log invoices without remembering to also
    // flip the dropdown, which is exactly why these cards were showing ₹0
    // even for campaigns with real invoices and payments recorded.
    const campaignInvoices = invoicesByCampaign.get(c.id) ?? [];
    const totalInvoiced = campaignInvoices.reduce((s, inv) => s + inv.invoiceAmount, 0);
    const totalReceived = campaignInvoices.reduce((s, inv) => s + (inv.amountReceived ?? 0), 0);

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
      onboardedCount: onboardedCreators.length,
      delayedCreatorsCount,
      deliverablesLive: deliverables.filter((d) => d.liveLink).length,
      deliverablesTotal: deliverables.length,
      // Only ONBOARDED creators are actually committed spend — a creator
      // still shortlisted, negotiating, or rejected has an internalCost
      // entered but nothing's actually been spent on them yet. Summing
      // every creator regardless of status (the old bug here) inflated
      // this into a number way bigger than what's actually locked in,
      // same mistake the Finance Table row below used to make. Matches
      // the ONBOARDED-only filter the campaign report CSV already uses.
      internalValue: showFinance ? onboardedCreators.reduce((s, cr) => s + (cr.internalCost ?? 0), 0) : 0,
      quotedValue,
      openFlags,
      // Not yet invoiced at all: quoted value minus whatever's already been
      // invoiced (clamped at 0 so an over-invoiced campaign, e.g. extra
      // charges, doesn't show a negative "yet to invoice").
      financeYetToBeInvoiced: showFinance ? Math.max(quotedValue - totalInvoiced, 0) : 0,
      // Invoiced but payment hasn't come in yet.
      financeYetToBeReceived: showFinance ? Math.max(totalInvoiced - totalReceived, 0) : 0,
      // Actually invoiced AND received from the client — this is the real
      // "cleared due" number, summed straight off the ledger.
      financeValueOfClearedDue: showFinance ? totalReceived : 0,
      // What TBM still owes onboarded creators — their own Payout Amount
      // (internalCost) wherever payoutPaymentStatus hasn't reached PAID yet.
      financeCreatorPayablePending: showFinance
        ? onboardedCreators.filter((cr) => cr.payoutPaymentStatus !== "PAID").reduce((s, cr) => s + (cr.internalCost ?? 0), 0)
        : 0,
      // Same showFinance gating as every other cost figure above — these
      // are internal-cost-adjacent (what TBM is billing the client), not
      // just hidden-in-the-UI for whoever can't see finance, actually
      // zeroed out server-side so it never reaches their browser payload.
      financeAgencyFee: showFinance ? c.financeAgencyFee : null,
      financeAgencyFeePercent: showFinance ? c.financeAgencyFeePercent : null,
      financeFeeType: showFinance ? c.financeFeeType : null,
      financeRetainerFee: showFinance ? c.financeRetainerFee : null,
    };
  });

  // The sheet's "Finance Table" section — lives on the dashboard itself.
  // The old standalone /finance page (a portfolio-wide Section A/B report)
  // was removed once that same breakdown moved onto each campaign's own
  // "Finance and Invoicing" tab. Built from the same `campaigns` fetch
  // above, no second query. Only ACTIVE/COMPLETED
  // campaigns show here — a paused or cancelled campaign's numbers
  // shouldn't appear in the live finance picture (FINANCE_VISIBLE_STATUSES).
  // Not computed at all for whoever can't see it (rather than computed and
  // left unrendered) — see the showFinance comment above.
  const financeRows: FinanceCampaignRow[] = !showFinance
    ? []
    : campaigns
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
      // Same real-quoted-cost fix as the dashboard rows above (not
      // budgetQuoted, which is an optional, often-unset top-level estimate).
      quotedValue: c.creators
        .filter((cr) => cr.status === "ONBOARDED")
        .reduce((s, cr) => s + (cr.finalQuotedCost ?? cr.quotedCost ?? 0), 0),
      financeAgencyFee: c.financeAgencyFee,
      financeAgencyFeePercent: c.financeAgencyFeePercent,
      financeFeeType: c.financeFeeType,
      financeRetainerFee: c.financeRetainerFee,
      financeClientInvoiceStatus: c.financeClientInvoiceStatus,
      onboardedCreators: c.creators
        .filter((cr) => cr.status === "ONBOARDED" && cr.onboardedAt)
        .map((cr) => ({
          onboardedAt: cr.onboardedAt!.toISOString(),
          deliverableCount: cr.deliverables.length,
        })),
    };
  });

  // Revenue Breakdown Chart — one row per ONBOARDED creator with a real
  // onboarding date. Revenue is that creator's own Final Quoted Cost (the
  // actual closed price, same figure the Onboarding tab's "Total Quoted
  // Cost" sums) falling back to Quoted Cost if final costing was somehow
  // skipped — NOT an even split of Campaign.budgetQuoted, which is an
  // optional top-level estimate that's frequently left unset (and was
  // silently producing ₹0 revenue for every creator whenever it was null).
  // Same closure-date convention as the Finance Table above, and same
  // FINANCE_VISIBLE_STATUSES filter — a campaign that's paused/cancelled
  // after some creators already onboarded shouldn't keep inflating this
  // chart's revenue/margin, same reasoning that already applies to the
  // Finance Table and the four summary cards above.
  const revenueRows: RevenueDataRow[] = !showFinance
    ? []
    : campaigns
        .filter((c) => (FINANCE_VISIBLE_STATUSES as string[]).includes(c.status))
        .flatMap((c) => {
    const onboarded = c.creators.filter((cr) => cr.status === "ONBOARDED" && cr.onboardedAt);
    return onboarded.map((cr) => ({
      brand: c.brand,
      onboardedAt: cr.onboardedAt!.toISOString(),
      internalCost: cr.internalCost ?? 0,
      revenue: cr.finalQuotedCost ?? cr.quotedCost ?? 0,
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

  // IR Executive personal dashboard — additive only, computed exactly per
  // the IR team's written feedback doc, alongside (not instead of) the
  // shared PortfolioDashboardClient above. Does not touch any of the
  // computations above it. Scope: creators this IR Executive personally
  // sourced (Creator.sourcedByUserId) who have since been onboarded — per
  // the feedback's own definition ("only counts once shortlisted by that
  // executive AND onboarded"). Every other IR Executive-only number below
  // (deliverables, turnaround time, financials, invoices) is derived from
  // that same creator set, so the whole section is internally consistent.
  let irExecutiveData: IrExecutiveDashboardData | null = null;
  if (user.role === "IR_EXECUTIVE") {
    const activeCampaignRows = await prisma.campaign.findMany({
      where: { ...campaignVisibilityWhere(user), status: "ACTIVE" },
      select: { id: true, name: true, brand: true, goLiveDeadline: true },
      orderBy: { updatedAt: "desc" },
    });

    const myCreators = (await (prisma as any).creator.findMany({
      where: { sourcedByUserId: user.id, status: "ONBOARDED" },
      select: {
        id: true,
        name: true,
        channelHandle: true,
        campaignId: true,
        campaign: { select: { name: true } },
        onboardedAt: true,
        goLiveDeadline: true,
        finalQuotedCost: true,
        quotedCost: true,
        internalCost: true,
        payoutPaymentStatus: true,
        payoutInvoiceRaised: true,
        payoutInvoiceReceived: true,
        deliverables: {
          select: {
            id: true,
            platform: true,
            liveLink: true,
            scriptApprovedAt: true,
            contentApprovedAt: true,
            videoSubmittedAt: true,
          },
        },
      },
    })) as {
      id: string;
      name: string;
      channelHandle: string;
      campaignId: string;
      campaign: { name: string };
      onboardedAt: Date | null;
      goLiveDeadline: Date | null;
      finalQuotedCost: number | null;
      quotedCost: number | null;
      internalCost: number | null;
      payoutPaymentStatus: string;
      payoutInvoiceRaised: boolean;
      payoutInvoiceReceived: boolean;
      deliverables: { id: string; platform: string; liveLink: string | null; scriptApprovedAt: Date | null; contentApprovedAt: Date | null; videoSubmittedAt: Date | null }[];
    }[];

    const myDeliverables = myCreators.flatMap((cr) => cr.deliverables.map((d) => ({ ...d, creator: cr })));
    const deliverablesTotal = myDeliverables.length;
    const deliverablesLive = myDeliverables.filter((d) => !!d.liveLink).length;

    // On time / nearing deadline (<=24h left) / delayed (deadline passed) —
    // only applies to deliverables not yet live, and only where the parent
    // creator has a deadline to measure against. Uses each creator's
    // goLiveDeadline, the same effective-deadline field the rest of the app
    // already tracks per onboarded creator (there's no separate
    // per-deliverable deadline field).
    const now = Date.now();
    const HOUR_MS = 60 * 60 * 1000;
    let deliverablesOnTime = 0;
    let deliverablesNearingDeadline = 0;
    let deliverablesDelayed = 0;
    for (const d of myDeliverables) {
      if (d.liveLink) continue;
      const deadline = d.creator.goLiveDeadline ? new Date(d.creator.goLiveDeadline).getTime() : null;
      if (deadline === null) continue;
      const remainingMs = deadline - now;
      if (remainingMs < 0) deliverablesDelayed++;
      else if (remainingMs <= 24 * HOUR_MS) deliverablesNearingDeadline++;
      else deliverablesOnTime++;
    }

    // Turnaround-time stage stats — average/best/worst across every
    // deliverable in scope that has both the start and end timestamp for
    // that stage (per the feedback doc: "only creator records containing
    // both the relevant start and completion timestamps should be
    // included").
    const stageStats = (pairs: { start: Date | null; end: Date | null }[]) => {
      const durations = pairs
        .filter((p): p is { start: Date; end: Date } => !!p.start && !!p.end)
        .map((p) => p.end.getTime() - p.start.getTime())
        .filter((ms) => ms >= 0);
      if (durations.length === 0) return { avgMs: null, bestMs: null, worstMs: null };
      return {
        avgMs: durations.reduce((s, v) => s + v, 0) / durations.length,
        bestMs: Math.min(...durations),
        worstMs: Math.max(...durations),
      };
    };

    const myOnboardToScript = stageStats(myDeliverables.map((d) => ({ start: d.creator.onboardedAt, end: d.scriptApprovedAt })));
    // "Video submission" — the real milestone now: the first time a review
    // link was saved for this deliverable (Deliverable.videoSubmittedAt,
    // stamped once in updateReviewLink). Older deliverables submitted
    // before this field existed simply won't have a value here and are
    // excluded from the average, same "only records with both timestamps"
    // rule as every other stage.
    const myScriptToVideo = stageStats(myDeliverables.map((d) => ({ start: d.scriptApprovedAt, end: d.videoSubmittedAt })));
    const myEndToEnd = stageStats(myDeliverables.map((d) => ({ start: d.creator.onboardedAt, end: d.contentApprovedAt })));

    // Company average — same three stages, same timestamp fields, across
    // every onboarded creator org-wide (not scoped to this executive), per
    // the feedback doc's "company average across all IR executives".
    const allOnboarded = (await (prisma as any).creator.findMany({
      where: { status: "ONBOARDED" },
      select: {
        onboardedAt: true,
        deliverables: { select: { scriptApprovedAt: true, contentApprovedAt: true, videoSubmittedAt: true } },
      },
    })) as { onboardedAt: Date | null; deliverables: { scriptApprovedAt: Date | null; contentApprovedAt: Date | null; videoSubmittedAt: Date | null }[] }[];
    const allPairs = allOnboarded.flatMap((cr) =>
      cr.deliverables.map((d) => ({ onboardedAt: cr.onboardedAt, scriptApprovedAt: d.scriptApprovedAt, contentApprovedAt: d.contentApprovedAt, videoSubmittedAt: d.videoSubmittedAt }))
    );
    const companyOnboardToScript = stageStats(allPairs.map((d) => ({ start: d.onboardedAt, end: d.scriptApprovedAt })));
    const companyScriptToVideo = stageStats(allPairs.map((d) => ({ start: d.scriptApprovedAt, end: d.videoSubmittedAt })));
    const companyEndToEnd = stageStats(allPairs.map((d) => ({ start: d.onboardedAt, end: d.contentApprovedAt })));

    // Creator financials — Total Value of Active Creators = Value Paid +
    // Value Due, per the feedback doc, all driven off each creator's own
    // Payout Amount (internalCost) and payoutPaymentStatus, same source of
    // truth the campaign page's Finance and Invoicing tab already uses.
    const valuePaid = myCreators.filter((cr) => cr.payoutPaymentStatus === "PAID").reduce((s, cr) => s + (cr.internalCost ?? 0), 0);
    const valueDue = myCreators.filter((cr) => cr.payoutPaymentStatus !== "PAID").reduce((s, cr) => s + (cr.internalCost ?? 0), 0);

    // Invoice status — one expected invoice per onboarded creator, counted
    // once its invoice has actually been raised (payoutInvoiceRaised), then
    // split by whether it's been received (payoutInvoiceReceived). Value is
    // that creator's Payout Amount (internalCost), so count and value both
    // reconcile exactly: received + pending = total, on both dimensions.
    const invoicesRaised = myCreators.filter((cr) => cr.payoutInvoiceRaised);
    const invoicesReceived = invoicesRaised.filter((cr) => cr.payoutInvoiceReceived);
    const invoicesPending = invoicesRaised.filter((cr) => !cr.payoutInvoiceReceived);

    // Detail-list rows for every clickable card/metric (item 5 of the
    // feedback doc). Built once here, server-side, off the same records
    // already fetched above — no extra queries. Each row that has an
    // obvious home page links there (a campaign or that creator's
    // campaign); rows with no dedicated page (a single deliverable, a
    // turnaround-duration line) render as plain text.
    const shortDate = (d: Date | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
    const campaignHref = (campaignId: string) => `/campaigns/${campaignId}`;
    const creatorRow = (cr: (typeof myCreators)[number]): { id: string; primary: string; secondary?: string; value?: string; href?: string } => ({
      id: cr.id,
      primary: cr.name,
      secondary: cr.campaign.name,
      value: cr.goLiveDeadline ? shortDate(cr.goLiveDeadline) : undefined,
      href: campaignHref(cr.campaignId),
    });
    const deliverableRow = (d: (typeof myDeliverables)[number]) => ({
      id: d.id,
      primary: `${d.creator.name} — ${d.platform}`,
      secondary: d.creator.campaign.name,
      value: d.liveLink ? "Live" : d.creator.goLiveDeadline ? shortDate(d.creator.goLiveDeadline) : undefined,
      href: campaignHref(d.creator.campaignId),
    });
    const notLive = myDeliverables.filter((d) => !d.liveLink);
    const durationRow = (label: string, pairs: { start: Date | null; end: Date | null; creator: (typeof myCreators)[number] }[]) =>
      pairs
        .filter((p) => p.start && p.end)
        .map((p) => ({
          id: `${label}-${p.creator.id}`,
          primary: p.creator.name,
          secondary: p.creator.campaign.name,
          value: formatDurationForDetail(p.end!.getTime() - p.start!.getTime()),
          href: campaignHref(p.creator.campaignId),
        }));

    const details: Record<string, { id: string; primary: string; secondary?: string; value?: string; href?: string }[]> = {
      activeCampaigns: activeCampaignRows.map((c) => ({
        id: c.id,
        primary: c.name,
        secondary: c.brand,
        value: c.goLiveDeadline ? shortDate(c.goLiveDeadline) : undefined,
        href: campaignHref(c.id),
      })),
      creatorsUnderExecution: myCreators.map(creatorRow),
      deliverablesTotal: myDeliverables.map(deliverableRow),
      deliverablesLive: myDeliverables.filter((d) => !!d.liveLink).map(deliverableRow),
      deliverablesOnTime: notLive
        .filter((d) => {
          const deadline = d.creator.goLiveDeadline ? new Date(d.creator.goLiveDeadline).getTime() : null;
          return deadline !== null && deadline - now > 24 * HOUR_MS;
        })
        .map(deliverableRow),
      deliverablesNearingDeadline: notLive
        .filter((d) => {
          const deadline = d.creator.goLiveDeadline ? new Date(d.creator.goLiveDeadline).getTime() : null;
          return deadline !== null && deadline - now >= 0 && deadline - now <= 24 * HOUR_MS;
        })
        .map(deliverableRow),
      deliverablesDelayed: notLive
        .filter((d) => {
          const deadline = d.creator.goLiveDeadline ? new Date(d.creator.goLiveDeadline).getTime() : null;
          return deadline !== null && deadline - now < 0;
        })
        .map(deliverableRow),
      turnaroundOnboardToScript: durationRow("onboard-script", myDeliverables.map((d) => ({ start: d.creator.onboardedAt, end: d.scriptApprovedAt, creator: d.creator }))),
      turnaroundScriptToVideo: durationRow("script-video", myDeliverables.map((d) => ({ start: d.scriptApprovedAt, end: d.videoSubmittedAt, creator: d.creator }))),
      turnaroundEndToEnd: durationRow("end-to-end", myDeliverables.map((d) => ({ start: d.creator.onboardedAt, end: d.contentApprovedAt, creator: d.creator }))),
      totalCreatorValue: myCreators.map((cr) => ({
        ...creatorRow(cr),
        value: formatCompactINR(cr.internalCost ?? 0),
      })),
      valueDue: myCreators.filter((cr) => cr.payoutPaymentStatus !== "PAID").map((cr) => ({ ...creatorRow(cr), value: formatCompactINR(cr.internalCost ?? 0) })),
      valuePaid: myCreators.filter((cr) => cr.payoutPaymentStatus === "PAID").map((cr) => ({ ...creatorRow(cr), value: formatCompactINR(cr.internalCost ?? 0) })),
      invoiceTotal: invoicesRaised.map((cr) => ({ ...creatorRow(cr), value: formatCompactINR(cr.internalCost ?? 0) })),
      invoiceReceived: invoicesReceived.map((cr) => ({ ...creatorRow(cr), value: formatCompactINR(cr.internalCost ?? 0) })),
      invoicePending: invoicesPending.map((cr) => ({ ...creatorRow(cr), value: formatCompactINR(cr.internalCost ?? 0) })),
    };

    irExecutiveData = {
      activeCampaigns: activeCampaignRows.length,
      creatorsUnderExecution: myCreators.length,
      deliverablesTotal,
      deliverablesLive,
      deliverablesOnTime,
      deliverablesNearingDeadline,
      deliverablesDelayed,
      turnaround: [
        { label: "Onboarding to script approval", yourAvgMs: myOnboardToScript.avgMs, yourBestMs: myOnboardToScript.bestMs, yourWorstMs: myOnboardToScript.worstMs, companyAvgMs: companyOnboardToScript.avgMs, detailKey: "turnaroundOnboardToScript" },
        { label: "Script approval to video", yourAvgMs: myScriptToVideo.avgMs, yourBestMs: myScriptToVideo.bestMs, yourWorstMs: myScriptToVideo.worstMs, companyAvgMs: companyScriptToVideo.avgMs, detailKey: "turnaroundScriptToVideo" },
        { label: "End-to-end (onboarding to content approved)", yourAvgMs: myEndToEnd.avgMs, yourBestMs: myEndToEnd.bestMs, yourWorstMs: myEndToEnd.worstMs, companyAvgMs: companyEndToEnd.avgMs, detailKey: "turnaroundEndToEnd" },
      ],
      totalCreatorValue: valuePaid + valueDue,
      valueDue,
      valuePaid,
      invoiceTotalCount: invoicesRaised.length,
      invoiceTotalValue: invoicesRaised.reduce((s, cr) => s + (cr.internalCost ?? 0), 0),
      invoiceReceivedCount: invoicesReceived.length,
      invoiceReceivedValue: invoicesReceived.reduce((s, cr) => s + (cr.internalCost ?? 0), 0),
      invoicePendingCount: invoicesPending.length,
      invoicePendingValue: invoicesPending.reduce((s, cr) => s + (cr.internalCost ?? 0), 0),
      details,
    };
  }

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

        {(canCreateCampaign(user.role) || isSuperAdmin(user.id)) && (
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:from-indigo-700 hover:to-indigo-800 hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0"
          >
            <Plus className="h-4 w-4" />
            <span>New Campaign</span>
          </Link>
        )}
      </div>

      {irExecutiveData && <IrExecutivePersonalDashboard data={irExecutiveData} />}

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
