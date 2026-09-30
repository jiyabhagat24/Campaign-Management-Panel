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

function MetricTile({
  label,
  value,
  hint,
  onClick,
  active,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className="rounded-xl bg-slate-50 p-4 text-left dark:bg-slate-800/60"
    >
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </button>
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

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200/60 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your dashboard</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Campaigns, creators and deliverables you own</p>
      </div>

      {/* 1. Campaign and execution summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricTile
          label="Active campaigns"
          value={String(data.activeCampaigns)}
          onClick={() => toggle("activeCampaigns")}
          active={openKey === "activeCampaigns"}
        />
        <MetricTile
          label="Creators under execution"
          value={String(data.creatorsUnderExecution)}
          hint="Sourced by you and onboarded"
          onClick={() => toggle("creatorsUnderExecution")}
          active={openKey === "creatorsUnderExecution"}
        />
        <MetricTile
          label="Deliverables"
          value={String(data.deliverablesTotal)}
          hint={`${data.deliverablesLive} live`}
          onClick={() => toggle("deliverablesTotal")}
          active={openKey === "deliverablesTotal"}
        />
      </div>
      {openKey && ["activeCampaigns", "creatorsUnderExecution", "deliverablesTotal"].includes(openKey) && openPanel}

      {!hasDeliverables ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No data available</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => toggle("deliverablesOnTime")}
              className="rounded-xl bg-emerald-50 p-3 text-left dark:bg-emerald-950/40"
            >
              <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">On time</p>
              <p className="mt-1 text-xl font-bold text-emerald-800 dark:text-emerald-200">{data.deliverablesOnTime}</p>
            </button>
            <button
              type="button"
              onClick={() => toggle("deliverablesNearingDeadline")}
              className="rounded-xl bg-amber-50 p-3 text-left dark:bg-amber-950/40"
            >
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Nearing deadline</p>
              <p className="mt-1 text-xl font-bold text-amber-800 dark:text-amber-200">{data.deliverablesNearingDeadline}</p>
            </button>
            <button
              type="button"
              onClick={() => toggle("deliverablesDelayed")}
              className="rounded-xl bg-rose-50 p-3 text-left dark:bg-rose-950/40"
            >
              <p className="text-xs font-medium text-rose-800 dark:text-rose-200">Delayed</p>
              <p className="mt-1 text-xl font-bold text-rose-800 dark:text-rose-200">{data.deliverablesDelayed}</p>
            </button>
          </div>
          {openKey && ["deliverablesLive", "deliverablesOnTime", "deliverablesNearingDeadline", "deliverablesDelayed"].includes(openKey) && openPanel}
        </>
      )}

      {/* 2. Turnaround-time analysis */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Turnaround time</h3>
        {!hasTurnaroundData ? (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">No data available</p>
        ) : (
          <>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400">
                    <th className="py-1.5 text-left font-medium">Stage</th>
                    <th className="py-1.5 text-right font-medium">Your average</th>
                    <th className="py-1.5 text-right font-medium">Your best</th>
                    <th className="py-1.5 text-right font-medium">Your worst</th>
                    <th className="py-1.5 text-right font-medium">Company average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.turnaround.map((stage) => (
                    <tr
                      key={stage.label}
                      onClick={() => toggle(stage.detailKey)}
                      className="cursor-pointer"
                    >
                      <td className="py-1.5 font-semibold text-slate-700 dark:text-slate-300">{stage.label}</td>
                      <td className="py-1.5 text-right font-bold text-slate-900 dark:text-white">{formatDuration(stage.yourAvgMs)}</td>
                      <td className="py-1.5 text-right text-slate-600 dark:text-slate-300">{formatDuration(stage.yourBestMs)}</td>
                      <td className="py-1.5 text-right text-slate-600 dark:text-slate-300">{formatDuration(stage.yourWorstMs)}</td>
                      <td className="py-1.5 text-right text-slate-400 dark:text-slate-500">{formatDuration(stage.companyAvgMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {openKey && data.turnaround.some((s) => s.detailKey === openKey) && <div className="mt-2">{openPanel}</div>}
          </>
        )}
      </div>

      {/* 3. Financial overview (creator payouts you're responsible for) */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Creator financials</h3>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">Active, onboarded creators</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricTile
            label="Total creator value"
            value={formatCompactINR(data.totalCreatorValue)}
            onClick={() => toggle("totalCreatorValue")}
            active={openKey === "totalCreatorValue"}
          />
          <MetricTile
            label="Value due"
            value={formatCompactINR(data.valueDue)}
            onClick={() => toggle("valueDue")}
            active={openKey === "valueDue"}
          />
          <MetricTile
            label="Value paid"
            value={formatCompactINR(data.valuePaid)}
            onClick={() => toggle("valuePaid")}
            active={openKey === "valuePaid"}
          />
        </div>
        {openKey && ["totalCreatorValue", "valueDue", "valuePaid"].includes(openKey) && <div className="mt-2">{openPanel}</div>}
      </div>

      {/* 4. Invoice status */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Invoice status</h3>
        {!hasInvoices ? (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">No data available</p>
        ) : (
          <div className="mt-2 space-y-3">
            <InvoiceBar
              label="Total invoices"
              count={data.invoiceTotalCount}
              value={data.invoiceTotalValue}
              fraction={1}
              barClassName="bg-indigo-500"
              onClick={() => toggle("invoiceTotal")}
              active={openKey === "invoiceTotal"}
            />
            <InvoiceBar
              label="Received"
              count={data.invoiceReceivedCount}
              value={data.invoiceReceivedValue}
              fraction={data.invoiceTotalCount ? data.invoiceReceivedCount / data.invoiceTotalCount : 0}
              barClassName="bg-emerald-500"
              onClick={() => toggle("invoiceReceived")}
              active={openKey === "invoiceReceived"}
            />
            <InvoiceBar
              label="Yet to be received"
              count={data.invoicePendingCount}
              value={data.invoicePendingValue}
              fraction={data.invoiceTotalCount ? data.invoicePendingCount / data.invoiceTotalCount : 0}
              barClassName="bg-amber-500"
              onClick={() => toggle("invoicePending")}
              active={openKey === "invoicePending"}
            />
            <div className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:justify-between">
              <span>
                Count reconciliation: {data.invoiceReceivedCount} + {data.invoicePendingCount} = {data.invoiceTotalCount}
              </span>
              <span>
                Value reconciliation: {formatCompactINR(data.invoiceReceivedValue)} + {formatCompactINR(data.invoicePendingValue)} = {formatCompactINR(data.invoiceTotalValue)}
              </span>
            </div>
            {openKey && ["invoiceTotal", "invoiceReceived", "invoicePending"].includes(openKey) && openPanel}
          </div>
        )}
      </div>
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
