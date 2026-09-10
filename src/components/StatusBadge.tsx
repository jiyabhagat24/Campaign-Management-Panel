const COLORS: Record<string, { bg: string; dot: string }> = {
  SHORTLISTED: { bg: "bg-slate-100/80 border-slate-200 text-slate-700 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300", dot: "bg-slate-500 dark:bg-slate-400" },
  CLIENT_LIKED: { bg: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-300", dot: "bg-blue-500 dark:bg-blue-400" },
  CLIENT_NEGOTIATING: { bg: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300", dot: "bg-amber-500 dark:bg-amber-400" },
  CLIENT_REJECTED: { bg: "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300", dot: "bg-rose-500 dark:bg-rose-400" },
  ONBOARDED: { bg: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300", dot: "bg-emerald-500 dark:bg-emerald-400" },
  REJECTED: { bg: "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300", dot: "bg-rose-500 dark:bg-rose-400" },
  BLOCKED: { bg: "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/60 dark:border-orange-800 dark:text-orange-300", dot: "bg-orange-500 dark:bg-orange-400" },
  // Client's Intent / Client's Final Intent options (shortlist stage)
  PENDING: { bg: "bg-slate-100/80 border-slate-200 text-slate-700 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300", dot: "bg-slate-500 dark:bg-slate-400" },
  INTERESTED: { bg: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-300", dot: "bg-blue-500 dark:bg-blue-400" },
  NEGOTIATING: { bg: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300", dot: "bg-amber-500 dark:bg-amber-400" },
  ONBOARD: { bg: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300", dot: "bg-emerald-500 dark:bg-emerald-400" },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = COLORS[status] ?? { bg: "bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300", dot: "bg-slate-400 dark:bg-slate-500" };
  const label = status.replace(/_/g, " ").toLowerCase();

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      <span className="capitalize">{label}</span>
    </span>
  );
}
