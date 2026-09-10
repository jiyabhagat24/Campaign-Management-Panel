import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isClient } from "@/lib/rbac";
import { getStaleChaseCandidates, logChase } from "@/lib/actions";
import { PhoneCall } from "lucide-react";

// Task #16 — Action Tracker: every client-chase touchpoint logged, and rows
// with no contact in 7+ days surfaced here (the spec's escalation trigger —
// pairing this with Escalations, task #14, is the next step once this list
// is in daily use).
export default async function ActionTrackerPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (isClient(user.role)) redirect("/dashboard");

  const stale = await getStaleChaseCandidates();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <PhoneCall className="h-6 w-6 text-amber-500" />
          Action Tracker
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Rows with no logged client-chase in 7+ days — log a touchpoint to clear a row off this list, or raise an
          escalation if it needs a manager.
        </p>
      </div>

      <div className="space-y-2">
        {stale.length === 0 && (
          <p className="rounded-xl border border-slate-200/80 bg-white p-4 text-sm text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
            Nothing overdue right now.
          </p>
        )}
        {stale.map(({ creator, daysSinceChase }) => (
          <div
            key={creator.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card dark:bg-slate-900 dark:border-slate-800"
          >
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{creator.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {creator.campaign.name} · {creator.status.replace(/_/g, " ")} ·{" "}
                <span className="font-semibold text-rose-600 dark:text-rose-400">{daysSinceChase} days since last chase</span>
              </p>
            </div>
            <form
              action={async (formData: FormData) => {
                "use server";
                await logChase(creator.id, String(formData.get("channel") ?? "EMAIL"), String(formData.get("note") ?? "") || undefined);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <select
                name="channel"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              >
                <option value="EMAIL">Email</option>
                <option value="CALL">Call</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
              <input
                name="note"
                placeholder="Note (optional)"
                className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              />
              <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                Log chase
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
