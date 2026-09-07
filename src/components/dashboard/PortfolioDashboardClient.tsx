"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import BrandAvatar from "@/components/campaign/BrandAvatar";
import { isGoLiveAtRisk, isGoLiveBreached } from "@/lib/sla";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, FINANCE_VISIBLE_STATUSES, type CampaignStatus } from "@/lib/constants";
import CampaignStatusSelect from "@/components/campaign/CampaignStatusSelect";
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
  goLiveDeadline: string | null; // ISO
  createdAt: string; // ISO
  brandSolutionsPoc: string | null;
  campaignManager: string | null;
  onboardedCount: number;
  deliverablesLive: number;
  deliverablesTotal: number;
  internalValue: number;
  openFlags: number;
  financeYetToBeInvoiced: number | null;
  financeYetToBeReceived: number | null;
  financeValueOfClearedDue: number | null;
  financeCreatorPayablePending: number | null;
  financeAgencyFee: number | null;
};

const money = formatCompactINR;

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
  revenueRows,
}: {
  campaigns: DashboardCampaignRow[];
  recentActivity: RecentActivityRow[];
  showRecentActivity: boolean;
  financeCampaigns: FinanceCampaignRow[];
  showFinance: boolean;
  revenueRows: RevenueDataRow[];
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
  const totalActiveCampaignValue = financeVisible.reduce((s, c) => s + (c.budgetQuoted ?? 0), 0);
  const totalInternalCampaignValue = financeVisible.reduce((s, c) => s + c.internalValue, 0);
  const marginPercent =
    totalActiveCampaignValue > 0
      ? ((totalActiveCampaignValue - totalInternalCampaignValue) / totalActiveCampaignValue) * 100
      : 0;
  // "On time" / "Delayed" — active campaigns split by whether their go-live
  // deadline has been breached, same isGoLiveBreached check used everywhere
  // else in this file. A campaign with no deadline set yet counts as on
  // time (nothing to be late against).
  const onTimeCount = activeOnly.filter((c) => !isGoLiveBreached(c.goLiveDeadline ? new Date(c.goLiveDeadline) : null)).length;
  const delayedCount = activeOnly.length - onTimeCount;

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
      {/* Filter bar — one horizontally-scrolling row of compact chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />

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

        <select className={pill(!!brandSolutions)} value={brandSolutions} onChange={(e) => setBrandSolutions(e.target.value)}>
          <option value="">Brand Solutions</option>
          {bsTeam.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <select className={pill(!!campaignManager)} value={campaignManager} onChange={(e) => setCampaignManager(e.target.value)}>
          <option value="">Campaign Manager</option>
          {cmTeam.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

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
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Campaigns</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{activeOnly.length}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Of {filtered.length} shown</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Creators Onboarded</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{creatorsOnboarded}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Across shown campaigns</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deliverables Live/Total</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">
            {deliverablesLive}/{deliverablesTotal}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Live vs. committed</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">On Time</p>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{onTimeCount}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Active, deadline not breached</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Delayed</p>
          </div>
          <p className={`mt-3 text-3xl font-extrabold ${delayedCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>{delayedCount}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Active, deadline breached</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Active Value</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(totalActiveCampaignValue)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Quoted, active campaigns</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Internal Value</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(totalInternalCampaignValue)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Creator cost, active campaigns</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Margin %</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{marginPercent.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Active campaign blended margin</p>
        </div>

        {/* Finance figures — manually entered per campaign via FinanceRow on
            the campaign page (no invoicing system yet, see schema comment). */}
        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Yet to be Invoiced</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(yetToBeInvoiced)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Manually entered</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Yet to be Received</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(yetToBeReceived)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Manually entered</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Value of Cleared Due</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(valueOfClearedDue)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Manually entered</p>
        </div>

        <div className="stat-card group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Creator Payable Pending</p>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">{money(creatorPayablePending)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Manually entered</p>
        </div>
      </div>

      {/* Campaign Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Campaign Table</h2>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {filtered.length} shown
            </span>
          </div>
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
          >
            <span>View all</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          {/* table-fixed + border-separate + explicit pixel widths on every
              column, matching the exact pattern the Shortlisting/Onboarding
              boards use (CreatorKanban.tsx) for their frozen Name/Socials/
              Deliverables columns — sticky positioning only lines up
              correctly when every column's width is fixed and known, not
              left to the browser to auto-size against content. */}
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="sticky left-0 top-0 z-40 w-[200px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">
                  Client
                </th>
                <th className="sticky left-[200px] top-0 z-40 w-[220px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">
                  Campaign
                </th>
                <th className="sticky top-0 z-30 w-[190px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Brand Solutions POC</th>
                <th className="sticky top-0 z-30 w-[190px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Campaign Manager POC</th>
                <th className="sticky top-0 z-30 w-[140px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Status</th>
                <th className="sticky top-0 z-30 w-[160px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Creators Onboarded</th>
                <th className="sticky top-0 z-30 w-[190px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Deliverables Live/Total</th>
                <th className="sticky top-0 z-30 w-[140px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Deadline</th>
                <th className="sticky top-0 z-30 w-[120px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Open Flags</th>
                <th className="sticky top-0 z-30 w-[140px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Quoted Value</th>
                <th className="sticky top-0 z-30 w-[140px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Internal Value</th>
                <th className="sticky top-0 z-30 w-[110px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Margin %</th>
                <th className="sticky top-0 z-30 w-[140px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Agency Fee</th>
                <th className="sticky top-0 z-30 w-[190px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Creator Payable Pending</th>
              </tr>
            </thead>
            <tbody className="font-medium">
              {filtered.map((c) => {
                const quotedValue = c.budgetQuoted ?? 0;
                const margin = quotedValue > 0 ? ((quotedValue - c.internalValue) / quotedValue) * 100 : null;
                const deadline = c.goLiveDeadline ? new Date(c.goLiveDeadline) : null;
                const breached = isGoLiveBreached(deadline);
                const atRiskStatus = isGoLiveAtRisk(deadline);

                return (
                  <tr key={c.id} className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="sticky left-0 z-10 w-[200px] min-w-[200px] max-w-[200px] overflow-hidden border-b border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
                      <div className="flex items-center gap-2.5">
                        <BrandAvatar brand={c.brand} logoUrl={c.brandLogoUrl} size={26} />
                        <span className="truncate font-semibold text-slate-900 dark:text-white">{c.brand}</span>
                      </div>
                    </td>
                    <td className="sticky left-[200px] z-10 w-[220px] min-w-[220px] max-w-[220px] overflow-hidden border-b border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="block truncate font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600 dark:border-slate-800 dark:text-slate-300">{c.brandSolutionsPoc ?? "—"}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600 dark:border-slate-800 dark:text-slate-300">{c.campaignManager ?? "—"}</td>
                    <td className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                      <CampaignStatusSelect campaignId={c.id} status={c.status} />
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">{c.onboardedCount}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      {c.deliverablesLive}/{c.deliverablesTotal}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800">
                      {deadline ? (
                        <span
                          className={
                            breached
                              ? "font-semibold text-rose-600 dark:text-rose-400"
                              : atRiskStatus
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : "text-slate-600 dark:text-slate-300"
                          }
                        >
                          {deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800">
                      {c.openFlags > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-bold text-rose-600 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300">
                          {c.openFlags}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">0</span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      {quotedValue ? `₹${quotedValue.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      {c.internalValue ? `₹${c.internalValue.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
                      {margin !== null ? `${margin.toFixed(1)}%` : "—"}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      {c.financeAgencyFee ? `₹${c.financeAgencyFee.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      {c.financeCreatorPayablePending ? `₹${c.financeCreatorPayablePending.toLocaleString("en-IN")}` : "—"}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                    <Megaphone className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-medium">No campaigns match these filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Finance Table — the sheet's separate "Finance Table" section,
          placed directly below the Campaign Table on the dashboard per
          explicit instruction (the /finance page holds the same report
          standalone, for a less-crowded view). */}
      {showFinance && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Finance Table</h2>
            <Link
              href="/finance"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
            >
              Open full Finance report →
            </Link>
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
