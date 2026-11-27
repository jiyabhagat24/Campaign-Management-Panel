"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import BrandAvatar from "@/components/campaign/BrandAvatar";
import { isGoLiveAtRisk, isGoLiveBreached } from "@/lib/sla";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, FINANCE_VISIBLE_STATUSES, type CampaignStatus } from "@/lib/constants";
import FinanceTableClient, { type FinanceCampaignRow } from "@/components/finance/FinanceTableClient";
import RevenueBreakdownChart, { type RevenueDataRow } from "@/components/dashboard/RevenueBreakdownChart";
import { formatCompactINR } from "@/lib/format";
import { Megaphone, ArrowRight, Filter, X } from "lucide-react";

export type DashboardCampaignRow = {
  id: string;
  name: string;
  brand: string;
  brandLogoUrl: string | null;
  status: string;
  budgetQuoted: number | null;
  // Sum of each onboarded creator's own Final Quoted Cost (falling back to
  // Quoted Cost) — the real committed revenue figure, as opposed to
  // budgetQuoted, an optional top-level estimate frequently left unset.
  quotedValue: number;
  goLiveDeadline: string | null; // ISO
  createdAt: string; // ISO
  brandSolutionsPoc: string | null;
  campaignManager: string | null;
  onboardedCount: number;
  // How many of this campaign's onboarded creators have their own go-live
  // deadline breached — see delayedCreatorsCount in dashboard/page.tsx.
  delayedCreatorsCount: number;
  deliverablesLive: number;
  deliverablesTotal: number;
  internalValue: number;
  pricedInternalValue: number;
  openFlags: number;
  financeYetToBeInvoiced: number | null;
  financeYetToBeReceived: number | null;
  financeValueOfClearedDue: number | null;
  financeCreatorPayablePending: number | null;
  financeAgencyFee: number | null;
  // Same PERCENTAGE/RETAINER split as FinanceRow.tsx and AssociationTypeField
  // — the Agency Fee column below needs to know which one applies so a
  // Retainer-basis campaign shows its retainer amount instead of a blank
  // "—" just because financeAgencyFeePercent was never set for it.
  financeAgencyFeePercent: number | null;
  financeFeeType: string | null;
  financeRetainerFee: number | null;
};

const money = formatCompactINR;

// Read-only mirror of CampaignStatusSelect's color map — used for the
// client-view status badge (clients see the status, never the editable
// dropdown; updateCampaignStatus also rejects client callers server-side,
// this is just about not showing them a control that isn't theirs to use).
const STATUS_BADGE_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
  ASSIGNED: "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300",
  ACTIVE: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300",
  ON_HOLD: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300",
  CLOSED: "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950/50 dark:border-sky-800 dark:text-sky-300",
  CANCELLED: "bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
};

export type RecentActivityRow = {
  id: string;
  actorName: string;
  action: string;
  createdAt: string; // ISO
  campaign: { name: string };
};

export default function PortfolioDashboardClient({
  campaigns,
  recentActivity,
  showRecentActivity,
  financeCampaigns,
  showFinance,
  hideFinanceCards = false,
  hideSummary = false,
  revenueRows,
  isClientView,
}: {
  campaigns: DashboardCampaignRow[];
  recentActivity: RecentActivityRow[];
  showRecentActivity: boolean;
  financeCampaigns: FinanceCampaignRow[];
  showFinance: boolean;
  // IR Executives don't see the four client-invoicing/payable cards.
  hideFinanceCards?: boolean;
  // IR Executives don't see the filter bar or the summary stat cards.
  hideSummary?: boolean;
  revenueRows: RevenueDataRow[];
  // Client-role viewer: the campaign list handed in is already scoped to
  // just their own campaigns (campaignVisibilityWhere on the server), same
  // as every other non-CXO role only ever getting their assigned campaigns.
  // This flag additionally strips the internal-only filters, stat cards,
  // and table columns (POCs, internal cost, margin, agency fee, manually
  // entered finance figures) that a client should never see, even for the
  // campaigns they're allowed to see.
  isClientView: boolean;
}) {
  const [client, setClient] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [brandSolutions, setBrandSolutions] = useState("");
  const [campaignManager, setCampaignManager] = useState("");

  const clients = useMemo(() => Array.from(new Set(campaigns.map((c) => c.brand))).sort(), [campaigns]);
  const bsTeam = useMemo(
    () => Array.from(new Set(campaigns.map((c) => c.brandSolutionsPoc).filter((v): v is string => !!v))).sort(),
    [campaigns]
  );
  const cmTeam = useMemo(
    () => Array.from(new Set(campaigns.map((c) => c.campaignManager).filter((v): v is string => !!v))).sort(),
    [campaigns]
  );
  // Campaign dropdown narrows to the selected client's campaigns — exactly
  // the "All Campaign of the selected client" dependency from the spec.
  const campaignOptions = useMemo(
    () => campaigns.filter((c) => !client || c.brand === client).map((c) => c.name).sort(),
    [campaigns, client]
  );

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (client && c.brand !== client) return false;
      if (campaignFilter && c.name !== campaignFilter) return false;
      if (status && c.status !== status) return false;
      if (brandSolutions && c.brandSolutionsPoc !== brandSolutions) return false;
      if (campaignManager && c.campaignManager !== campaignManager) return false;
      if (dateFrom && new Date(c.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(c.createdAt) > new Date(`${dateTo}T23:59:59`)) return false;
      return true;
    });
  }, [campaigns, client, campaignFilter, status, brandSolutions, campaignManager, dateFrom, dateTo]);

  const hasActiveFilters = !!(client || campaignFilter || status || dateFrom || dateTo || brandSolutions || campaignManager);

  const clearFilters = () => {
    setClient("");
    setCampaignFilter("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setBrandSolutions("");
    setCampaignManager("");
  };

  // ---------- Summary row, recomputed from the filtered set ----------
  // Two different slices of `filtered`, for two different purposes:
  //  - activeOnly: strictly ACTIVE, used for the SLA "On Time"/"Delayed"
  //    cards — a Hold/Completed/Cancelled campaign isn't "on time or late",
  //    that question doesn't apply to it anymore.
  //  - financeVisible: ACTIVE or COMPLETED (FINANCE_VISIBLE_STATUSES) — the
  //    money figures below (Total Active/Internal Value, margin, and the
  //    four manually-entered finance fields). A campaign that's on hold or
  //    cancelled shouldn't inflate — or appear in — the live financial
  //    picture; one that's wrapped up successfully still should.
  const activeOnly = filtered.filter((c) => c.status === "ACTIVE");
  const financeVisible = filtered.filter((c) => (FINANCE_VISIBLE_STATUSES as string[]).includes(c.status));
  const creatorsOnboarded = filtered.reduce((s, c) => s + c.onboardedCount, 0);
  const deliverablesLive = filtered.reduce((s, c) => s + c.deliverablesLive, 0);
  const deliverablesTotal = filtered.reduce((s, c) => s + c.deliverablesTotal, 0);
  const totalActiveCampaignValue = financeVisible.reduce((s, c) => s + c.quotedValue, 0);
  const totalInternalCampaignValue = financeVisible.reduce((s, c) => s + c.internalValue, 0);
  // Margin skips onboarded creators with no client price (neither revenue nor cost).
  const pricedInternalValue = financeVisible.reduce((s, c) => s + c.pricedInternalValue, 0);
  const marginPercent =
    totalActiveCampaignValue > 0
      ? ((totalActiveCampaignValue - pricedInternalValue) / totalActiveCampaignValue) * 100
      : 0;
  // "On time" / "Delayed" — counted per onboarded CREATOR within active
  // campaigns, not per campaign: a single campaign commonly has some
  // creators past their go-live deadline and others still fine, so counting
  // the whole campaign as "delayed" the moment one creator slips overstated
  // the problem (see delayedCreatorsCount in dashboard/page.tsx).
  const delayedCount = activeOnly.reduce((s, c) => s + c.delayedCreatorsCount, 0);
  const onTimeCount = activeOnly.reduce((s, c) => s + c.onboardedCount, 0) - delayedCount;

  // Manually-entered finance figures (see FinanceRow on the campaign page) —
  // summed across the finance-visible set, null treated as 0.
  const yetToBeInvoiced = financeVisible.reduce((s, c) => s + (c.financeYetToBeInvoiced ?? 0), 0);
  const yetToBeReceived = financeVisible.reduce((s, c) => s + (c.financeYetToBeReceived ?? 0), 0);
  const valueOfClearedDue = financeVisible.reduce((s, c) => s + (c.financeValueOfClearedDue ?? 0), 0);
  const creatorPayablePending = financeVisible.reduce((s, c) => s + (c.financeCreatorPayablePending ?? 0), 0);

  // Zomato/Swiggy-style filter chip: a native <select> (or date input)
  // styled as a small rounded pill, sized to its content rather than
  // stretched to a grid cell. Turns indigo once a value is picked so it's
  // obvious at a glance which filters are active. Native elements (not a
  // custom dropdown) keep this cheap while still looking like a chip row.
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold outline-none transition-colors cursor-pointer ${
      active
        ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600"
    }`;

  return (
    <div className="space-y-8">
      {!hideSummary && (
      <>
      {/* Filter bar — one horizontally-scrolling row of compact chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />

        {!isClientView && (
          <select
            className={pill(!!client)}
            value={client}
            onChange={(e) => {
              setClient(e.target.value);
              setCampaignFilter("");
            }}
          >
            <option value="">Client</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        <select className={pill(!!campaignFilter)} value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
          <option value="">Campaign</option>
          {campaignOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select className={pill(!!status)} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Status</option>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CAMPAIGN_STATUS_LABELS[s as CampaignStatus]}
            </option>
          ))}
        </select>

        <input
          type="date"
          title="From date"
          className={pill(!!dateFrom)}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <span className="text-xs text-slate-300 dark:text-slate-600">–</span>
        <input
          type="date"
          title="To date"
          className={pill(!!dateTo)}
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />

        {!isClientView && (
          <select className={pill(!!brandSolutions)} value={brandSolutions} onChange={(e) => setBrandSolutions(e.target.value)}>
            <option value="">Brand Solutions</option>
            {bsTeam.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}

        {!isClientView && (
          <select className={pill(!!campaignManager)} value={campaignManager} onChange={(e) => setCampaignManager(e.target.value)}>
            <option value="">Campaign Manager</option>
            {cmTeam.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-transparent px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Campaigns</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{activeOnly.length}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Of {filtered.length} shown</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Creators Onboarded</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{creatorsOnboarded}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Across shown campaigns</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Deliverables Live/Total</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">
            {deliverablesLive}/{deliverablesTotal}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Live vs. committed</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">On Time</p>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{onTimeCount}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Active, deadline not breached</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Delayed</p>
          </div>
          <p className={`mt-3 text-3xl font-extrabold ${delayedCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>{delayedCount}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Active, deadline breached</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Active Value</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(totalActiveCampaignValue)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Quoted, active campaigns</p>
        </div>

        {!isClientView && (
          <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Internal Value</p>
            <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(totalInternalCampaignValue)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Creator cost, active campaigns</p>
          </div>
        )}

        {!isClientView && (
          <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Margin %</p>
            <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{marginPercent.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Active campaign blended margin</p>
          </div>
        )}

        {/* Finance figures — computed per campaign from its Client Invoice
            status and each onboarded creator's payout status (see
            dashboard/page.tsx). TBM-internal money movement, never shown to
            a client. */}
        {!isClientView && !hideFinanceCards && (
          <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Yet to be Invoiced</p>
            <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(yetToBeInvoiced)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Quoted value not yet invoiced to the client</p>
          </div>
        )}

        {!isClientView && !hideFinanceCards && (
          <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Yet to be Received</p>
            <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(yetToBeReceived)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Invoiced to the client, payment not yet received</p>
          </div>
        )}

        {!isClientView && !hideFinanceCards && (
          <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Value of Cleared Due</p>
            <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(valueOfClearedDue)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Invoiced and payment received from the client</p>
          </div>
        )}

        {!isClientView && !hideFinanceCards && (
          <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Creator Payable Pending</p>
            <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(creatorPayablePending)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Owed to onboarded creators, payout not yet completed</p>
          </div>
        )}
      </div>

      </>
      )}
      {/* Campaign Table — Creator records layout: five stacked columns, no
          horizontal scroll. Same fields as before, grouped per cell. */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Campaign table</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">{filtered.length} records</span>
            <Link href="/campaigns" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
              <span>View all</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="w-[26%] px-5 py-2.5">Campaign / client</th>
              {!isClientView && <th className="w-[18%] px-5 py-2.5">Owners</th>}
              <th className="w-[18%] px-5 py-2.5">Status / deadline</th>
              <th className="w-[14%] px-5 py-2.5">Delivery</th>
              <th className={`${isClientView ? "w-[42%]" : "w-[24%]"} px-5 py-2.5`}>{isClientView ? "Quoted value" : "Commercials / payable"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((c) => {
              const quotedValue = c.quotedValue;
              const margin = quotedValue > 0 ? ((quotedValue - c.internalValue) / quotedValue) * 100 : null;
              const deadline = c.goLiveDeadline ? new Date(c.goLiveDeadline) : null;
              const breached = isGoLiveBreached(deadline);
              const atRiskStatus = isGoLiveAtRisk(deadline);
              const fee =
                c.financeFeeType === "RETAINER"
                  ? c.financeRetainerFee
                    ? `₹${c.financeRetainerFee.toLocaleString("en-IN")} retainer`
                    : null
                  : c.financeAgencyFeePercent !== null
                  ? `${c.financeAgencyFeePercent}% fee`
                  : c.financeAgencyFee
                  ? `₹${c.financeAgencyFee.toLocaleString("en-IN")} fee`
                  : null;
              return (
                <tr key={c.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3">
                    <Link href={`/campaigns/${c.id}`} className="block truncate font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">
                      {c.name}
                    </Link>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c.brand}</p>
                  </td>
                  {!isClientView && (
                    <td className="px-5 py-3">
                      <p className="truncate text-slate-700 dark:text-slate-300">CM {c.campaignManager ?? "—"}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">BS {c.brandSolutionsPoc ?? "—"}</p>
                    </td>
                  )}
                  <td className="px-5 py-3">
                    <p className="text-slate-700 dark:text-slate-300">{CAMPAIGN_STATUS_LABELS[c.status as CampaignStatus] ?? c.status}</p>
                    <p
                      className={`text-xs ${
                        breached ? "font-semibold text-rose-600 dark:text-rose-400" : atRiskStatus ? "font-semibold text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {deadline ? deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No deadline"}
                      {c.openFlags > 0 && <span className="font-semibold text-rose-600 dark:text-rose-400"> · {c.openFlags} flag{c.openFlags === 1 ? "" : "s"}</span>}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-slate-700 dark:text-slate-300">{c.deliverablesLive}/{c.deliverablesTotal} live</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{c.onboardedCount} onboarded</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-slate-700 dark:text-slate-300">{quotedValue ? `₹${quotedValue.toLocaleString("en-IN")}` : "—"} quoted</p>
                    {!isClientView && (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {c.internalValue ? `₹${c.internalValue.toLocaleString("en-IN")}` : "—"} internal · {margin !== null ? `${margin.toFixed(1)}%` : "—"} margin
                        {fee ? ` · ${fee}` : ""}
                        {c.financeCreatorPayablePending ? ` · ₹${c.financeCreatorPayablePending.toLocaleString("en-IN")} payable` : ""}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isClientView ? 4 : 5} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">
                  No campaigns match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Finance Table — the sheet's separate "Finance Table" section,
          placed directly below the Campaign Table on the dashboard. The
          standalone /finance page (a portfolio-wide flat report) was
          removed once the same Section A/B breakdown moved onto each
          campaign's own "Finance and Invoicing" tab, so there's no separate
          full-report page to link out to anymore — the per-campaign tab is
          reached from each campaign directly. */}
      {showFinance && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Finance table</h2>
          </div>
          <FinanceTableClient campaigns={financeCampaigns} />
        </div>
      )}

      {/* Revenue Breakdown Chart — same gating as Finance Table since it
          exposes internal cost and margin. Placed right after it. */}
      {showFinance && <RevenueBreakdownChart rows={revenueRows} />}
    </div>
  );
}
