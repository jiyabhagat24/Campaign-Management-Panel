"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronUp } from "lucide-react";
import { formatCompactINR } from "@/lib/format";

// IR Executive personal dashboard — built exactly to the IR team's written
// feedback doc (campaigns/creators/deliverables summary, a turnaround-time
// analysis, and a financial + invoice-status section). All the underlying
// numbers and detail-list rows are computed once in dashboard/page.tsx and
// handed down as plain props, same pattern as PortfolioDashboardClient's
// rows — the only client-side state here is which detail list, if any, is
// currently expanded (item 5 of the feedback doc: every card/metric is
// clickable and opens its detailed list).

export type TurnaroundStage = {
  label: string;
  yourAvgMs: number | null;
  yourBestMs: number | null;
  yourWorstMs: number | null;
  companyAvgMs: number | null;
  detailKey: string;
};

// One row in an expanded detail list — deliberately generic so every
// section (campaigns, creators, deliverables, turnaround durations,
// financials, invoices) can reuse the same row shape and renderer.
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
  details: Record<string, DetailRow[]>;
};

// "2d 4h" / "6h" / "—" — consistent single format for every duration shown
// in the turnaround table, per the spec's "hours, or days and hours" note.
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

// Same stat-card look as the summary row in PortfolioDashboardClient.
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

// Same section-card look as the Campaign Table card.
function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/40">
        <div className="h-2 w-2 rounded-full bg-indigo-600" />
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <span className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</span>}
      </div>
      <div className="space-y-3 p-6">{children}</div>
    </div>
  );
}

// The single expandable panel shared by every clickable card — renders
// whichever detail list is currently open, right under its section, and
// collapses when the same card is clicked again.
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

export default function IrExecutivePersonalDashboard({ data }: { data: IrExecutiveDashboardData }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
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
    deliverablesNearingDeadline: "Nearing deadline",
    deliverablesDelayed: "Delayed",
    totalCreatorValue: "Total creator value",
    valueDue: "Value due",
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

  return (
    <div className="space-y-8">
      {/* 1. Campaign and execution summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile label="Active Campaigns" value={String(data.activeCampaigns)} onClick={() => toggle("activeCampaigns")} active={openKey === "activeCampaigns"} />
        <MetricTile label="Creators Under Execution" value={String(data.creatorsUnderExecution)} hint="Sourced by you and onboarded" onClick={() => toggle("creatorsUnderExecution")} active={openKey === "creatorsUnderExecution"} />
        <MetricTile label="Deliverables" value={String(data.deliverablesTotal)} hint={`${data.deliverablesLive} live`} onClick={() => toggle("deliverablesTotal")} active={openKey === "deliverablesTotal"} />
      </div>
      {panelFor(["activeCampaigns", "creatorsUnderExecution", "deliverablesTotal"])}

      {hasDeliverables ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricTile label="On Time" value={String(data.deliverablesOnTime)} valueClassName="text-emerald-600 dark:text-emerald-400" onClick={() => toggle("deliverablesOnTime")} active={openKey === "deliverablesOnTime"} />
            <MetricTile label="Nearing Deadline" value={String(data.deliverablesNearingDeadline)} valueClassName="text-amber-600 dark:text-amber-400" onClick={() => toggle("deliverablesNearingDeadline")} active={openKey === "deliverablesNearingDeadline"} />
            <MetricTile label="Delayed" value={String(data.deliverablesDelayed)} valueClassName="text-rose-600 dark:text-rose-400" onClick={() => toggle("deliverablesDelayed")} active={openKey === "deliverablesDelayed"} />
          </div>
          {panelFor(["deliverablesLive", "deliverablesOnTime", "deliverablesNearingDeadline", "deliverablesDelayed"])}
        </>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500">No data available</p>
      )}

      {/* 2. Turnaround-time analysis */}
      <SectionCard title="Turnaround Time">
        {!hasTurnaroundData ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No data available</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 text-left">Stage</th>
                    <th className="py-2 text-right">Your average</th>
                    <th className="py-2 text-right">Your best</th>
                    <th className="py-2 text-right">Your worst</th>
                    <th className="py-2 text-right">Company average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.turnaround.map((stage) => (
                    <tr key={stage.label} onClick={() => toggle(stage.detailKey)} className="cursor-pointer">
                      <td className="py-2 font-semibold text-slate-700 dark:text-slate-300">{stage.label}</td>
                      <td className="py-2 text-right font-bold text-slate-900 dark:text-white">{formatDuration(stage.yourAvgMs)}</td>
                      <td className="py-2 text-right text-slate-600 dark:text-slate-300">{formatDuration(stage.yourBestMs)}</td>
                      <td className="py-2 text-right text-slate-600 dark:text-slate-300">{formatDuration(stage.yourWorstMs)}</td>
                      <td className="py-2 text-right text-slate-500 dark:text-slate-400">{formatDuration(stage.companyAvgMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {panelFor(data.turnaround.map((s) => s.detailKey))}
          </>
        )}
      </SectionCard>

      {/* 3. Financial overview */}
      <SectionCard title="Creator Financials" subtitle="Active, onboarded creators">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricTile label="Total Creator Value" value={formatCompactINR(data.totalCreatorValue)} onClick={() => toggle("totalCreatorValue")} active={openKey === "totalCreatorValue"} />
          <MetricTile label="Value Due" value={formatCompactINR(data.valueDue)} onClick={() => toggle("valueDue")} active={openKey === "valueDue"} />
          <MetricTile label="Value Paid" value={formatCompactINR(data.valuePaid)} onClick={() => toggle("valuePaid")} active={openKey === "valuePaid"} />
        </div>
        {panelFor(["totalCreatorValue", "valueDue", "valuePaid"])}
      </SectionCard>

      {/* 4. Invoice status */}
      <SectionCard title="Invoice Status">
        {!hasInvoices ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No data available</p>
        ) : (
          <>
            <InvoiceBar label="Total invoices" count={data.invoiceTotalCount} value={data.invoiceTotalValue} fraction={1} barClassName="bg-indigo-500" onClick={() => toggle("invoiceTotal")} active={openKey === "invoiceTotal"} />
            <InvoiceBar label="Received" count={data.invoiceReceivedCount} value={data.invoiceReceivedValue} fraction={data.invoiceTotalCount ? data.invoiceReceivedCount / data.invoiceTotalCount : 0} barClassName="bg-emerald-500" onClick={() => toggle("invoiceReceived")} active={openKey === "invoiceReceived"} />
            <InvoiceBar label="Yet to be received" count={data.invoicePendingCount} value={data.invoicePendingValue} fraction={data.invoiceTotalCount ? data.invoicePendingCount / data.invoiceTotalCount : 0} barClassName="bg-amber-500" onClick={() => toggle("invoicePending")} active={openKey === "invoicePending"} />
            <div className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:justify-between">
              <span>Count reconciliation: {data.invoiceReceivedCount} + {data.invoicePendingCount} = {data.invoiceTotalCount}</span>
              <span>Value reconciliation: {formatCompactINR(data.invoiceReceivedValue)} + {formatCompactINR(data.invoicePendingValue)} = {formatCompactINR(data.invoiceTotalValue)}</span>
            </div>
            {panelFor(["invoiceTotal", "invoiceReceived", "invoicePending"])}
          </>
        )}
      </SectionCard>
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
