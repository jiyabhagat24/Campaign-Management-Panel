import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClient, campaignVisibilityWhere } from "@/lib/rbac";
import { raiseEscalation, claimEscalation, closeEscalation, listEscalations } from "@/lib/actions";
import { AlertTriangle } from "lucide-react";

// Task #14 — Escalation object, spec State Machine: Open -> Owned -> Closed.
// Raised by any internal role or the Client, claimed by its proposed owner
// (or the IR Manager), closed only with a resolution note + root cause
// logged (Gate G14). Server actions do the real enforcement (see
// raiseEscalation/claimEscalation/closeEscalation in actions.ts) — this page
// is the minimal UI over them.
export default async function EscalationsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (isClient(user.role)) redirect("/dashboard");

  const [escalations, campaigns, internalUsers] = await Promise.all([
    listEscalations(),
    prisma.campaign.findMany({
      where: campaignVisibilityWhere(user),
      select: { id: true, name: true, brand: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);

  const open = escalations.filter((e) => e.status === "OPEN");
  const owned = escalations.filter((e) => e.status === "OWNED");
  const closed = escalations.filter((e) => e.status === "CLOSED");

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          Escalations
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Open it, claim it, close it with a resolution — every escalation logs who raised it, who owns it, and why
          it closed (Gate G14).
        </p>
      </div>

      <form
        action={async (formData: FormData) => {
          "use server";
          await raiseEscalation({
            campaignId: String(formData.get("campaignId")),
            title: String(formData.get("title") ?? ""),
            description: String(formData.get("description") ?? "") || undefined,
            sitsAt: String(formData.get("sitsAt") ?? "GENERAL"),
            severity: String(formData.get("severity") ?? "MEDIUM"),
            proposedOwnerId: String(formData.get("proposedOwnerId") ?? "") || undefined,
          });
        }}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card dark:bg-slate-900 dark:border-slate-800 sm:grid-cols-2"
      >
        <select name="campaignId" required className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white">
          <option value="">Campaign…</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.brand} — {c.name}
            </option>
          ))}
        </select>
        <select name="proposedOwnerId" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white">
          <option value="">Propose owner (optional)…</option>
          {internalUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role.replace(/_/g, " ")})
            </option>
          ))}
        </select>
        <input
          name="title"
          required
          placeholder="Title"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white sm:col-span-2"
        />
        <textarea
          name="description"
          placeholder="Description (optional)"
          rows={2}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white sm:col-span-2"
        />
        <select name="sitsAt" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white">
          <option value="GENERAL">General</option>
          <option value="PRICING">Pricing</option>
          <option value="ONBOARDING">Onboarding</option>
          <option value="EXECUTION">Execution</option>
          <option value="FINANCE">Finance</option>
        </select>
        <select name="severity" defaultValue="MEDIUM" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white">
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 sm:col-span-2"
        >
          Raise Escalation
        </button>
      </form>

      {[
        { label: "Open", rows: open },
        { label: "Owned", rows: owned },
        { label: "Closed", rows: closed },
      ].map((section) => (
        <div key={section.label}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {section.label} ({section.rows.length})
          </h2>
          <div className="space-y-2">
            {section.rows.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">None.</p>}
            {section.rows.map((e) => (
              <div
                key={e.id}
                className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card dark:bg-slate-900 dark:border-slate-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{e.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {e.campaign.brand} — {e.campaign.name} · {e.sitsAt} · {e.severity}
                    </p>
                    {e.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{e.description}</p>}
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Raised by {e.raisedByUser?.name ?? e.raisedByClient?.name ?? "—"}
                      {e.owner ? ` · Owner: ${e.owner.name}` : e.proposedOwner ? ` · Proposed owner: ${e.proposedOwner.name}` : ""}
                    </p>
                    {e.status === "CLOSED" && (
                      <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                        Resolved: {e.resolutionNote} ({e.rootCauseCategory})
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    {e.status === "OPEN" && (
                      <form
                        action={async () => {
                          "use server";
                          await claimEscalation(e.id);
                        }}
                      >
                        <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-300">
                          Claim
                        </button>
                      </form>
                    )}
                    {e.status === "OWNED" && (
                      <form
                        action={async (formData: FormData) => {
                          "use server";
                          await closeEscalation(
                            e.id,
                            String(formData.get("resolutionNote") ?? ""),
                            String(formData.get("rootCauseCategory") ?? "OTHER")
                          );
                        }}
                        className="flex flex-col items-end gap-1"
                      >
                        <input
                          name="resolutionNote"
                          required
                          placeholder="Resolution note"
                          className="w-44 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                        />
                        <select
                          name="rootCauseCategory"
                          className="w-44 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                        >
                          <option value="PROCESS">Process</option>
                          <option value="COMMUNICATION">Communication</option>
                          <option value="CLIENT">Client</option>
                          <option value="CREATOR">Creator</option>
                          <option value="OTHER">Other</option>
                        </select>
                        <button className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                          Close
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
