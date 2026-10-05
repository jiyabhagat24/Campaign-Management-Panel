"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronUp } from "lucide-react";
import { formatCompactINR } from "@/lib/format";
import type { Snapshot, SnapshotGroup, ActionRequired, Upcoming } from "@/lib/irDashboard";

// IR Executive / IR Intern personal dashboard. Layout follows the IR team's
// design doc (performance overview, creator execution snapshot, action
// required, upcoming 7 days, turnaround time, creator financials, invoice
// status), styled with this app's existing stat-card / section-card look.
// All numbers are computed once in dashboard/page.tsx; the only client-side
// state here is which detail list or "show all" toggle is open.

export type TurnaroundStage = {
  label: string;
  yourAvgMs: number | null;
  yourBestMs: number | null;
  yourWorstMs: number | null;
  companyAvgMs: number | null;
  detailKey: string;
};

export type DetailRow = {
  id: string;
  primary: string;
  secondary?: string;
  value?: string;
  href?: string;
};

export type IrExecutiveDashboardData = {
  activeCampaigns: number;
  creatorsUnderExecution: number;
  deliverablesTotal: number;
  deliverablesLive: number;
  deliverablesOnTime: number;
  deliverablesNearingDeadline: number;
  deliverablesDelayed: number;
  turnaround: TurnaroundStage[];
  totalCreatorValue: number;
  valueDue: number;
  valuePaid: number;
  invoiceTotalCount: number;
  invoiceTotalValue: number;
  invoiceReceivedCount: number;
  invoiceReceivedValue: number;
  invoicePendingCount: number;
  invoicePendingValue: number;
  // false for IR Interns — creator financials and invoice status are hidden.
  showFinancials: boolean;
  currentlyDue: number;
  upcomingDue: number;
  lastUpdated: string;
  snapshot: Snapshot;
  actions: ActionRequired;
  upcoming: Upcoming;
  details: Record<string, DetailRow[]>;
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalHours = Math.round(ms / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days === 0) return `${hours}h`;
  return `${days}d ${hours}h`;
}

const STAT_BAR = "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-rose-500";
const STAT_LABEL = "text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider";

function MetricTile({
  label,
  value,
  hint,
  onClick,
  active,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick: () => void;
  active: boolean;
  valueClassName?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-expanded={active} className="stat-card group w-full text-left dark:bg-slate-900 dark:border-slate-800">
      <div className={STAT_BAR} />
      <p className={STAT_LABEL}>{label}</p>
      <p className={`mt-3 text-3xl font-extrabold ${valueClassName ?? "text-slate-900 dark:text-white"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">{hint}</p>}
    </button>
  );
}

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/40">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-2 w-2 shrink-0 rounded-full bg-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
          {subtitle && <span className="hidden truncate text-[11px] text-slate-500 dark:text-slate-400 md:inline">{subtitle}</span>}
        </div>
        {right}
      </div>
      <div className="space-y-3 p-6">{children}</div>
    </div>
  );
}

function DetailPanel({ title, rows, onClose }: { title: string; rows: DetailRow[]; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          Close <ChevronUp className="h-3 w-3" />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">No data available</p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {rows.map((row) => {
            const content = (
              <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-700 dark:text-slate-300">{row.primary}</p>
                  {row.secondary && <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{row.secondary}</p>}
                </div>
                {row.value && <span className="shrink-0 text-slate-500 dark:text-slate-400">{row.value}</span>}
              </div>
            );
            return row.href ? (
              <li key={row.id}>
                <Link href={row.href} className="block hover:bg-slate-50 dark:hover:bg-slate-900">
                  {content}
                </Link>
              </li>
            ) : (
              <li key={row.id}>{content}</li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const TONE_BAR: Record<string, string> = {
  blue: "bg-sky-400",
  amber: "bg-amber-400",
  green: "bg-emerald-500",
  purple: "bg-violet-400",
  rose: "bg-rose-400",
};

function StatusCard({ title, group }: { title: string; group: SnapshotGroup }) {
  return (
    <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">Total {group.total}</span>
      </div>
      {group.items.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">No data available</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {group.items.map((it) => (
            <div key={it.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">{it.label}</span>
                <span className="font-bold text-slate-900 dark:text-white">{it.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${TONE_BAR[it.tone]}`}
                  style={{ width: `${group.total ? Math.max(4, (it.count / group.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  Critical: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  High: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Medium: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
};

const KIND_STYLE: Record<string, string> = {
  script: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  video: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  product: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  post: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const ACTION_PREVIEW = 5;
const UPCOMING_PREVIEW = 6;

export default function IrExecutivePersonalDashboard({ data }: { data: IrExecutiveDashboardData }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key));

  const hasDeliverables = data.deliverablesTotal > 0;
  const hasTurnaroundData = data.turnaround.some((s) => s.yourAvgMs !== null || s.companyAvgMs !== null);
  const hasInvoices = data.invoiceTotalCount > 0;

  const panelTitles: Record<string, string> = {
    activeCampaigns: "Active campaigns",
    creatorsUnderExecution: "Creators under execution",
    deliverablesTotal: "All deliverables",
    deliverablesLive: "Live deliverables",
    deliverablesOnTime: "On time",
    deliverablesNearingDeadline: "Due in 24h",
    deliverablesDelayed: "Delayed",
    totalCreatorValue: "Total creator value",
    valueDue: "Yet to be paid",
    currentlyDue: "Currently due",
    valuePaid: "Value paid",
    invoiceTotal: "Total invoices",
    invoiceReceived: "Invoices received",
    invoicePending: "Invoices yet to be received",
  };
  for (const stage of data.turnaround) panelTitles[stage.detailKey] = stage.label;

  const openPanel = openKey ? (
    <DetailPanel title={panelTitles[openKey] ?? openKey} rows={data.details[openKey] ?? []} onClose={() => setOpenKey(null)} />
  ) : null;
  const panelFor = (keys: string[]) => (openKey && keys.includes(openKey) ? openPanel : null);

  const snap = data.snapshot;
  const chips = data.actions.chips;
  const actionRows = showAllActions ? data.actions.rows : data.actions.rows.slice(0, ACTION_PREVIEW);

  const upcomingFlat = data.upcoming.days.flatMap((d) => d.items.map((item) => ({ dayKey: d.key, item })));
  const visibleUpcoming = showAllUpcoming ? upcomingFlat : upcomingFlat.slice(0, UPCOMING_PREVIEW);
  const visibleDays = data.upcoming.days
    .map((d) => ({ ...d, items: visibleUpcoming.filter((x) => x.dayKey === d.key).map((x) => x.item) }))
    .filter((d) => d.items.length > 0);

  const allocTotal = data.valuePaid + data.upcomingDue + data.currentlyDue;
  const pct = (n: number) => (allocTotal ? Math.round((n / allocTotal) * 100) : 0);

  return (
    <div className="space-y-6">
      {/* Performance overview */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Performance overview</p>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">My dashboard</h2>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">Last updated: {data.lastUpdated}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MetricTile label="Active Campaigns" value={String(data.activeCampaigns)} hint="Assigned to you" onClick={() => toggle("activeCampaigns")} active={openKey === "activeCampaigns"} />
        <MetricTile label="Creators Under Execution" value={String(data.creatorsUnderExecution)} hint="Shortlisted by you · onboarded" onClick={() => toggle("creatorsUnderExecution")} active={openKey === "creatorsUnderExecution"} />
      </div>
      {panelFor(["activeCampaigns", "creatorsUnderExecution"])}

      <div className="stat-card dark:bg-slate-900 dark:border-slate-800">
        <div className={STAT_BAR} />
        <p className={STAT_LABEL}>Deliverables</p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <button type="button" onClick={() => toggle("deliverablesTotal")} className="text-left">
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{data.deliverablesTotal}</p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Total</p>
          </button>
          <button type="button" onClick={() => toggle("deliverablesLive")} className="text-left">
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{data.deliverablesLive}</p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Live</p>
          </button>
        </div>
        {hasDeliverables ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <button type="button" onClick={() => toggle("deliverablesOnTime")} className="rounded-xl bg-emerald-50 p-3 text-left dark:bg-emerald-950/40">
              <p className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{data.deliverablesOnTime}</p>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">On time</p>
            </button>
            <button type="button" onClick={() => toggle("deliverablesNearingDeadline")} className="rounded-xl bg-amber-50 p-3 text-left dark:bg-amber-950/40">
              <p className="text-xl font-bold text-amber-800 dark:text-amber-200">{data.deliverablesNearingDeadline}</p>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Due in 24h</p>
            </button>
            <button type="button" onClick={() => toggle("deliverablesDelayed")} className="rounded-xl bg-rose-50 p-3 text-left dark:bg-rose-950/40">
              <p className="text-xl font-bold text-rose-800 dark:text-rose-200">{data.deliverablesDelayed}</p>
              <p className="text-xs font-medium text-rose-700 dark:text-rose-300">Delayed</p>
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">No data available</p>
        )}
        <Link
          href="/my-creators"
          className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          <span>Open all deliverables and filter them by live, on-time, nearing-deadline, or delayed status.</span>
        </Link>
      </div>
      {panelFor(["deliverablesTotal", "deliverablesLive", "deliverablesOnTime", "deliverablesNearingDeadline", "deliverablesDelayed"])}

      {/* Creator execution snapshot */}
      <SectionCard title="Creator Execution Snapshot" subtitle="Current execution position across creators, deliverables and approvals">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Onboarded creators</p>
            <p className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-white">{snap.onboardedCreators}</p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Active creators assigned to this executive</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-800 lg:col-span-2">
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total deliverables</p>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">Format bifurcation</span>
            </div>
            <p className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-white">{snap.totalDeliverables}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {snap.formats.map((f) => (
                <div key={f.code} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{f.count}</p>
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{f.code}</p>
                  <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">{f.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <StatusCard title="Product status" group={snap.product} />
          <StatusCard title="Script status" group={snap.script} />
          <StatusCard title="Video status" group={snap.video} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl bg-amber-50 px-5 py-4 dark:bg-amber-950/30">
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Action pending at creator’s end</p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">Across scripts, videos and documentation</p>
            </div>
            <p className="text-3xl font-extrabold text-amber-800 dark:text-amber-200">{snap.pendingCreator}</p>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-5 py-4 dark:bg-indigo-950/30">
            <div>
              <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200">Action pending at client’s end</p>
              <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80">Across briefings, feedback and approvals</p>
            </div>
            <p className="text-3xl font-extrabold text-indigo-800 dark:text-indigo-200">{snap.pendingClient}</p>
          </div>
        </div>
      </SectionCard>

      {/* Action required + Upcoming 7 days, side by side so the page stays short */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          title="Action Required"
          subtitle="Highest-priority tasks"
          right={
            <Link href="/my-creators" className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
              View all tasks →
            </Link>
          }
        >
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{chips.delayed} delayed</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{chips.due24} due in 24h</span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{chips.followups} follow-ups</span>
            {data.showFinancials && (
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{chips.financeBlockers} finance blockers</span>
            )}
          </div>
          {actionRows.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No data available</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {actionRows.map((r) => (
                <li key={r.id}>
                  <Link href={r.href} className="flex items-center gap-3 py-2.5 hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <span className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-bold ${PRIORITY_STYLE[r.priority]}`}>{r.priority}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{r.title}</p>
                      <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{r.sub}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-slate-600 dark:text-slate-300">{r.pendingWith}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">{r.status}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.actions.rows.length > ACTION_PREVIEW && (
            <button type="button" onClick={() => setShowAllActions((v) => !v)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
              {showAllActions ? "Show fewer" : `Show all ${data.actions.total}`}
            </button>
          )}
        </SectionCard>

        <SectionCard
          title="Upcoming 7 Days"
          subtitle="Submissions, postings and deliveries ahead"
          right={<span className="shrink-0 text-xs font-semibold text-indigo-600 dark:text-indigo-400">{data.upcoming.total} upcoming items</span>}
        >
          {visibleDays.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No data available</p>
          ) : (
            <div className="space-y-3">
              {visibleDays.map((day) => (
                <div key={day.key} className="flex gap-3">
                  <div className="w-11 shrink-0 self-start rounded-lg bg-slate-100 py-1.5 text-center dark:bg-slate-800">
                    <p className="text-base font-bold leading-none text-slate-900 dark:text-white">{day.day}</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{day.month}</p>
                  </div>
                  <ul className="min-w-0 flex-1 space-y-1.5">
                    {day.items.map((it) => (
                      <li key={it.id}>
                        <Link href={it.href} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_STYLE[it.kind]}`}>{it.label}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{it.name}</p>
                            <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{it.sub} · {it.note}</p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {data.upcoming.total > UPCOMING_PREVIEW && (
            <button type="button" onClick={() => setShowAllUpcoming((v) => !v)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
              {showAllUpcoming ? "Show fewer" : `Show all ${data.upcoming.total}`}
            </button>
          )}
        </SectionCard>
      </div>

      {/* Turnaround-time analysis */}
      <SectionCard title="Turnaround-Time Analysis" subtitle="Completed creator records with valid start and end timestamps">
        {!hasTurnaroundData ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No data available</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 text-left">Execution stage</th>
                    <th className="py-2 text-right">Your average</th>
                    <th className="py-2 text-right">Best</th>
                    <th className="py-2 text-right">Worst</th>
                    <th className="py-2 text-right">Company avg.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.turnaround.map((stage) => (
                    <tr key={stage.label} onClick={() => toggle(stage.detailKey)} className="cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="py-2 font-semibold text-slate-700 dark:text-slate-300">{stage.label}</td>
                      <td className="py-2 text-right font-bold text-indigo-600 dark:text-indigo-400">{formatDuration(stage.yourAvgMs)}</td>
                      <td className="py-2 text-right text-emerald-600 dark:text-emerald-400">{formatDuration(stage.yourBestMs)}</td>
                      <td className="py-2 text-right text-rose-600 dark:text-rose-400">{formatDuration(stage.yourWorstMs)}</td>
                      <td className="py-2 text-right text-slate-500 dark:text-slate-400">{formatDuration(stage.companyAvgMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Best and worst are shown only when the stage has been completed.</p>
            {panelFor(data.turnaround.map((s) => s.detailKey))}
          </>
        )}
      </SectionCard>

      {data.showFinancials && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SectionCard title="Creator Financials" subtitle="Active, onboarded creators managed by this executive">
            <div className="grid grid-cols-2 gap-4">
              <MetricTile label="Total Creator Value" value={formatCompactINR(data.totalCreatorValue)} onClick={() => toggle("totalCreatorValue")} active={openKey === "totalCreatorValue"} />
              <MetricTile label="Value Paid" value={formatCompactINR(data.valuePaid)} hint={`${pct(data.valuePaid)}% of total value`} onClick={() => toggle("valuePaid")} active={openKey === "valuePaid"} />
              <MetricTile label="Yet To Be Paid" value={formatCompactINR(data.valueDue)} hint="Upcoming + currently due" onClick={() => toggle("valueDue")} active={openKey === "valueDue"} />
              <MetricTile label="Currently Due" value={formatCompactINR(data.currentlyDue)} hint="Content live, payment payable" valueClassName="text-amber-600 dark:text-amber-400" onClick={() => toggle("currentlyDue")} active={openKey === "currentlyDue"} />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Total value allocation</span>
                <span className="text-slate-400 dark:text-slate-500">{formatCompactINR(allocTotal)} total</span>
              </div>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="bg-emerald-500" style={{ width: `${pct(data.valuePaid)}%` }} />
                <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${pct(data.upcomingDue)}%` }} />
                <div className="bg-amber-400" style={{ width: `${pct(data.currentlyDue)}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Paid · {pct(data.valuePaid)}% · {formatCompactINR(data.valuePaid)}</span>
                <span>Upcoming · {pct(data.upcomingDue)}% · {formatCompactINR(data.upcomingDue)}</span>
                <span>Currently due · {pct(data.currentlyDue)}% · {formatCompactINR(data.currentlyDue)}</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Yet to be paid = Upcoming + Currently due</p>
            </div>
            {panelFor(["totalCreatorValue", "valuePaid", "valueDue", "currentlyDue"])}
          </SectionCard>

          <SectionCard title="Invoice Status" subtitle="Count and corresponding invoice value">
            {!hasInvoices ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No data available</p>
            ) : (
              <>
                <InvoiceBar label="Total invoices" count={data.invoiceTotalCount} value={data.invoiceTotalValue} fraction={1} barClassName="bg-indigo-500" onClick={() => toggle("invoiceTotal")} active={openKey === "invoiceTotal"} />
                <InvoiceBar label="Received" count={data.invoiceReceivedCount} value={data.invoiceReceivedValue} fraction={data.invoiceTotalCount ? data.invoiceReceivedCount / data.invoiceTotalCount : 0} barClassName="bg-emerald-500" onClick={() => toggle("invoiceReceived")} active={openKey === "invoiceReceived"} />
                <InvoiceBar label="Yet to be received" count={data.invoicePendingCount} value={data.invoicePendingValue} fraction={data.invoiceTotalCount ? data.invoicePendingCount / data.invoiceTotalCount : 0} barClassName="bg-amber-500" onClick={() => toggle("invoicePending")} active={openKey === "invoicePending"} />
                <div className="-mx-6 -mb-6 mt-2 space-y-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 text-sm dark:border-slate-800 dark:bg-slate-800/30">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Count reconciliation</span>
                    <span className="font-bold text-slate-900 dark:text-white">{data.invoiceReceivedCount} + {data.invoicePendingCount} = {data.invoiceTotalCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Value reconciliation</span>
                    <span className="font-bold text-slate-900 dark:text-white">{formatCompactINR(data.invoiceReceivedValue)} + {formatCompactINR(data.invoicePendingValue)} = {formatCompactINR(data.invoiceTotalValue)}</span>
                  </div>
                </div>
                {panelFor(["invoiceTotal", "invoiceReceived", "invoicePending"])}
              </>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function InvoiceBar({
  label,
  count,
  value,
  fraction,
  barClassName,
  onClick,
  active,
}: {
  label: string;
  count: number;
  value: number;
  fraction: number;
  barClassName: string;
  onClick: () => void;
  active: boolean;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <button type="button" onClick={onClick} aria-expanded={active} className="block w-full text-left">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-slate-400 dark:text-slate-500">
          {count} &middot; {formatCompactINR(value)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}
