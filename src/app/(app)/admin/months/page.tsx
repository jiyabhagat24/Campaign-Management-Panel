import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { canManageTeam } from "@/lib/rbac";
import { listMonths, lockMonth, getOrCreateMonth } from "@/lib/actions";
import { CalendarCheck, Lock } from "lucide-react";

// Task #17 — Month lock (Gate G12): finance figures stay provisional/
// editable all month; only a CXO locks a month once the accounts audit is
// complete. No unlock action by design — a post-lock correction goes
// through auditCorrectionNotes on a fresh lock call, not by reopening.
export default async function MonthsAdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canManageTeam(user.role)) redirect("/dashboard");

  const months = await listMonths();

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const hasCurrent = months.some((m) => m.month === currentMonthKey);
  if (!hasCurrent) {
    await getOrCreateMonth(currentMonthKey);
  }
  const rows = hasCurrent ? months : await listMonths();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <CalendarCheck className="h-6 w-6 text-indigo-500" />
          Month Lock
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Finance figures across the panel stay provisional until you lock the month here. Lock once the accounts
          audit for that month is complete.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((m) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card dark:bg-slate-900 dark:border-slate-800"
          >
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{m.month}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {m.status === "LOCKED"
                  ? `Locked by ${m.lockedBy?.name ?? "—"} on ${m.lockedAt ? new Date(m.lockedAt).toLocaleDateString() : "—"}`
                  : "Provisional — finance figures still editable"}
              </p>
            </div>
            {m.status === "PROVISIONAL" ? (
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await lockMonth(m.month, String(formData.get("auditCorrectionNotes") ?? "") || undefined);
                }}
                className="flex items-center gap-2"
              >
                <input
                  name="auditCorrectionNotes"
                  placeholder="Audit notes (optional)"
                  className="w-56 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                />
                <button className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">
                  <Lock className="h-3 w-3" />
                  Lock month
                </button>
              </form>
            ) : (
              <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                Locked
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
