import { formatCompactINR } from "@/lib/format";

// IR Executive personal dashboard — built exactly to the IR team's written
// feedback doc (campaigns/creators/deliverables summary, a turnaround-time
// analysis, and a financial + invoice-status section). Purely presentational
// and server-rendered: every number here is computed once in
// dashboard/page.tsx and handed down as plain props, same pattern as
// PortfolioDashboardClient's rows. No client-side state or logic of its own.

export type TurnaroundStage = {
  label: string;
  yourAvgMs: number | null;
  yourBestMs: number | null;
  yourWorstMs: number | null;
  companyAvgMs: number | null;
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

function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export default function IrExecutivePersonalDashboard({ data }: { data: IrExecutiveDashboardData }) {
  const hasDeliverables = data.deliverablesTotal > 0;
  const hasTurnaroundData = data.turnaround.some(
    (s) => s.yourAvgMs !== null || s.companyAvgMs !== null
  );
  const hasInvoices = data.invoiceTotalCount > 0;

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200/60 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your dashboard</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Campaigns, creators and deliverables you own</p>
      </div>

      {/* 1. Campaign and execution summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricTile label="Active campaigns" value={String(data.activeCampaigns)} />
        <MetricTile
          label="Creators under execution"
          value={String(data.creatorsUnderExecution)}
          hint="Sourced by you and onboarded"
        />
        <MetricTile
          label="Deliverables"
          value={String(data.deliverablesTotal)}
          hint={`${data.deliverablesLive} live`}
        />
      </div>

      {!hasDeliverables ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No data available</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">On time</p>
            <p className="mt-1 text-xl font-bold text-emerald-800 dark:text-emerald-200">{data.deliverablesOnTime}</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/40">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Nearing deadline</p>
            <p className="mt-1 text-xl font-bold text-amber-800 dark:text-amber-200">{data.deliverablesNearingDeadline}</p>
          </div>
          <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/40">
            <p className="text-xs font-medium text-rose-800 dark:text-rose-200">Delayed</p>
            <p className="mt-1 text-xl font-bold text-rose-800 dark:text-rose-200">{data.deliverablesDelayed}</p>
          </div>
        </div>
      )}

      {/* 2. Turnaround-time analysis */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Turnaround time</h3>
        {!hasTurnaroundData ? (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">No data available</p>
        ) : (
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
                  <tr key={stage.label}>
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
        )}
      </div>

      {/* 3. Financial overview (creator payouts you're responsible for) */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Creator financials</h3>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">Active, onboarded creators</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricTile label="Total creator value" value={formatCompactINR(data.totalCreatorValue)} />
          <MetricTile label="Value due" value={formatCompactINR(data.valueDue)} />
          <MetricTile label="Value paid" value={formatCompactINR(data.valuePaid)} />
        </div>
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
            />
            <InvoiceBar
              label="Received"
              count={data.invoiceReceivedCount}
              value={data.invoiceReceivedValue}
              fraction={data.invoiceTotalCount ? data.invoiceReceivedCount / data.invoiceTotalCount : 0}
              barClassName="bg-emerald-500"
            />
            <InvoiceBar
              label="Yet to be received"
              count={data.invoicePendingCount}
              value={data.invoicePendingValue}
              fraction={data.invoiceTotalCount ? data.invoicePendingCount / data.invoiceTotalCount : 0}
              barClassName="bg-amber-500"
            />
            <div className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:justify-between">
              <span>
                Count reconciliation: {data.invoiceReceivedCount} + {data.invoicePendingCount} = {data.invoiceTotalCount}
              </span>
              <span>
                Value reconciliation: {formatCompactINR(data.invoiceReceivedValue)} + {formatCompactINR(data.invoicePendingValue)} = {formatCompactINR(data.invoiceTotalValue)}
              </span>
            </div>
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
}: {
  label: string;
  count: number;
  value: number;
  fraction: number;
  barClassName: string;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-slate-400 dark:text-slate-500">
          {count} &middot; {formatCompactINR(value)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
