// Cards shared by the management homes (sandbox audit, Phase 2). Layout
// follows the TBM Campaign OS sandbox; colours are the panel's own tokens.

import Link from "next/link";
import { SandboxCard } from "@/components/finance/SandboxUi";
import { formatCompactINR } from "@/lib/format";

export type Exception = { tone: "high" | "medium"; title: string; reason: string; href: string };

export function ExceptionsCard({ title, items, emptyText }: { title: string; items: Exception[]; emptyText: string }) {
  return (
    <SandboxCard title={title} aside={<span className="text-xs text-slate-500 dark:text-slate-400">{items.length} open</span>}>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.slice(0, 8).map((e, i) => (
            <li key={i}>
              <Link href={e.href} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span
                  className={`mt-0.5 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    e.tone === "high" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                  }`}
                >
                  {e.tone === "high" ? "High" : "Watch"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{e.title}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{e.reason}</span>
                </span>
              </Link>
            </li>
          ))}
          {items.length > 8 && <li className="px-5 py-2 text-xs text-slate-500 dark:text-slate-400">+{items.length - 8} more</li>}
        </ul>
      )}
    </SandboxCard>
  );
}

export function ExecutionSnapshotCard({ snap }: { snap: { script: number; video: number; ready: number; live: number; total: number } }) {
  const rows = [
    { label: "Script", value: snap.script },
    { label: "Video", value: snap.video },
    { label: "Ready to publish", value: snap.ready },
    { label: "Live", value: snap.live },
  ];
  return (
    <SandboxCard title="Execution snapshot" footer={`${snap.total} deliverables on onboarded creators. Counts come from the deliverable records.`}>
      <div className="space-y-4 px-5 py-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700 dark:text-slate-300">{r.label}</span>
              <span className="font-bold text-slate-900 dark:text-white">{r.value}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${snap.total ? Math.round((r.value / snap.total) * 100) : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </SandboxCard>
  );
}

export function PaymentPipelineCard({ p, href }: { p: { source: "ledger" | "flags"; invoiced: number; paid: number; unpaid: number; due: number | null }; href: string }) {
  const rows = [
    { label: p.source === "ledger" ? "Invoices received" : "Committed creator payouts", value: p.invoiced },
    { label: "Actual payouts", value: p.paid },
    { label: "Yet to be paid", value: p.unpaid },
    ...(p.due !== null ? [{ label: "Due to date", value: p.due }] : []),
  ];
  return (
    <SandboxCard
      title="Creator payment pipeline"
      aside={
        <Link href={href} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
          Finance ledger →
        </Link>
      }
      footer={p.source === "ledger" ? "From logged creator invoices and payouts." : "No creator invoices logged yet, so this uses the payout status on each onboarded creator."}
    >
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-5 py-2.5 text-sm">
            <dt className="text-slate-600 dark:text-slate-300">{r.label}</dt>
            <dd className="font-bold text-slate-900 dark:text-white">{formatCompactINR(r.value)}</dd>
          </div>
        ))}
      </dl>
    </SandboxCard>
  );
}

export function StatGrid({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800">
      {items.map((s) => (
        <div key={s.label} className="bg-white px-5 py-3 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{s.label}</p>
          <p className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">{s.value}</p>
          {s.hint && <p className="text-[11px] text-slate-500 dark:text-slate-400">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}
