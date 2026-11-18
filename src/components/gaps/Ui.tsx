// Small shared pieces for the gap-build pages. Panel palette only
// (slate / indigo = gold / amber = dusty rose).

export function ErrorBanner({ error }: { error?: string | string[] }) {
  const msg = Array.isArray(error) ? error[0] : error;
  if (!msg) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      {msg}
    </div>
  );
}

export function DbNotice({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600 shadow-card dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      {what} needs a one-time database update. Run <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">npx prisma db push</code>, restart the dev server, then reload.
    </div>
  );
}

const TONES: Record<string, string> = {
  gold: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  rose: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  grey: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  dark: "bg-slate-900 text-white dark:bg-slate-700",
};

export function Pill({ tone = "grey", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${TONES[tone]}`}>{children}</span>;
}

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-indigo-900";
export const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
export const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500";
export const secondaryBtn =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
