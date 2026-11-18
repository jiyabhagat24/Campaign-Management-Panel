import { redirect } from "next/navigation";
import { PageHeadline, pageClass } from "@/components/finance/SandboxUi";
import { currentUser } from "@/lib/auth";
import { canManageTeam } from "@/lib/rbac";
import { listMonths, lockMonth, getOrCreateMonth } from "@/lib/actions";
import { CalendarCheck, Lock } from "lucide-react";
import ActionForm from "@/components/ActionForm";

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
    <div className={pageClass}>
      <PageHeadline title="Month lock." subtitle={<>Finance figures across the panel stay provisional until you lock the month here. Lock once the accounts
          audit for that month is complete.</>} />

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
              <ActionForm
                action={async (formData: FormData) => {
                  "use server";
                  try {
                    await lockMonth(m.month, String(formData.get("auditCorrectionNotes") ?? "") || undefined);
                    return { error: null };
                  } catch (err: any) {
                    return { error: err?.message ?? "Failed to lock month." };
                  }
                }}
                confirmMessage={`Lock ${m.month}? There's no unlock action — a later correction goes through a fresh lock call with audit notes, not by reopening this one.`}
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
              </ActionForm>
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
