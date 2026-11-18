// Shared building blocks for screens ported from the TBM Campaign OS sandbox:
// a headline, a KPI strip with one emphasised card, and titled cards.
// Uses only the panel's existing palette tokens (slate / indigo=gold / amber=rose).

// The one page header used across the panel (title, muted subtitle, and an
// optional slot on the right for page actions such as "New campaign").
export function PageHeadline({ title, subtitle, aside }: { title: React.ReactNode; subtitle?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {aside && <div className="flex flex-shrink-0 items-center gap-2">{aside}</div>}
    </div>
  );
}

// Page wrapper with the same width and spacing everywhere.
export const pageClass = "mx-auto max-w-7xl space-y-6 p-6 lg:p-8";

export function Kpi({ label, value, hint, emphasis }: { label: string; value: string | number; hint: string; emphasis?: boolean }) {
  return (
    <div
      className={
        emphasis
          ? "rounded-2xl bg-slate-900 p-5 text-white shadow-card dark:bg-slate-800"
          : "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900"
      }
    >
      <p className={`text-xs font-medium ${emphasis ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>{label}</p>
      <p className={`mt-3 text-3xl font-extrabold ${emphasis ? "text-indigo-300" : "text-slate-900 dark:text-white"}`}>{value}</p>
      <p className={`mt-1 text-xs ${emphasis ? "text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>{hint}</p>
    </div>
  );
}

export function SandboxCard({ title, aside, children, footer }: { title: string; aside?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
        {aside}
      </div>
      {children}
      {footer && (
        <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">{footer}</p>
      )}
    </section>
  );
}

export const thClass = "px-5 py-2.5";
export const theadClass = "bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400";
export const tbodyClass = "divide-y divide-slate-100 dark:divide-slate-800";

// Main page action (e.g. "New campaign"), same everywhere.
export const primaryActionClass =
  "inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-card transition-colors hover:bg-indigo-700";
