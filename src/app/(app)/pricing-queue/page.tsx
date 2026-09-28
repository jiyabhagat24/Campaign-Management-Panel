import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewPricingQueue, canApproveCommercialEdit, campaignVisibilityWhere, isSuperAdmin } from "@/lib/rbac";
import { DollarSign, RefreshCcw } from "lucide-react";

// Task #15 — Pricing Queue: every shortlist row still waiting on a Campaign
// Manager's vet decision (In Pricing → Published/Rejected, spec State
// Machine). Viewable by Campaign Manager, IR Manager, Brand Solutions and
// CXO (canViewPricingQueue) — the actual pricing action still only ever
// happens from a campaign's own Shortlist tab, still gated to Campaign
// Manager there (canSetCommercials). Not a new table — just the existing
// Creator rows with internalCost set and no quotedCost yet, i.e. IR has
// submitted a row for pricing but nobody's vetted it.
//
// Brand Solutions' role here per the Page Permissions matrix is narrower
// than "view the whole queue" — they approve reopen requests only, i.e. the
// dual-approval flow on a locked Final Quoted Cost (requestFinalCostEdit /
// approveFinalCostEditRequest, canApproveCommercialEdit = Brand-Solutions-
// only). The section below surfaces exactly those pending requests so
// Brand Solutions has something to act on from this page; the "needs
// pricing" list further down is still theirs (and CXO's) to view only.
export default async function PricingQueuePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewPricingQueue(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");

  const canActOnQueue = user.role === "CAMPAIGN_MANAGER" || isSuperAdmin(user.id);
  const canApproveReopenRequests = canApproveCommercialEdit(user.role) || isSuperAdmin(user.id);

  const [rows, reopenRequests] = await Promise.all([
    prisma.creator.findMany({
      where: {
        status: { notIn: ["REJECTED", "CLIENT_REJECTED"] },
        quotedCost: null,
        internalCost: { not: null },
        campaign: campaignVisibilityWhere(user),
      },
      include: { campaign: { select: { id: true, name: true, brand: true } } },
      orderBy: { createdAt: "asc" },
    }),
    canApproveReopenRequests
      ? (prisma.creator.findMany({
          where: {
            campaign: campaignVisibilityWhere(user),
            OR: [{ pendingQuotedCostEdit: { not: null } }, { pendingFinalCostEdit: { not: null } }],
          } as any,
          include: { campaign: { select: { id: true, name: true, brand: true } } },
          orderBy: { createdAt: "asc" },
        }) as Promise<any[]>)
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <DollarSign className="h-6 w-6 text-emerald-500" />
          Pricing Queue
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Rows IR has submitted with an internal cost but no Quoted Cost yet — vet and price each one from its
          campaign's Shortlist tab (Gate G1: nothing here reaches the client until it's priced).
        </p>
      </div>

      {canApproveReopenRequests && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <RefreshCcw className="h-3.5 w-3.5" />
            Pending Reopen Requests ({reopenRequests.length})
          </h2>
          {reopenRequests.length === 0 && (
            <p className="rounded-xl border border-slate-200/80 bg-white p-4 text-sm text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
              No requests to reopen a locked cost right now.
            </p>
          )}
          {reopenRequests.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.campaignId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-4 shadow-card transition-colors hover:border-indigo-400 dark:bg-indigo-950/30 dark:border-indigo-800/60"
            >
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {c.campaign.brand} — {c.campaign.name}
                  {c.pendingFinalCostEditReason ? ` · "${c.pendingFinalCostEditReason}"` : ""}
                  {c.pendingQuotedCostEditReason ? ` · "${c.pendingQuotedCostEditReason}"` : ""}
                </p>
              </div>
              <span className="rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                Review & approve on campaign
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Needs Pricing ({rows.length})
        </h2>
        {rows.length === 0 && (
          <p className="rounded-xl border border-slate-200/80 bg-white p-4 text-sm text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
            Nothing waiting on pricing right now.
          </p>
        )}
        {rows.map((c) => (
          <Link
            key={c.id}
            href={`/campaigns/${c.campaignId}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card transition-colors hover:border-indigo-200 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-indigo-800"
          >
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {c.campaign.brand} — {c.campaign.name} · Internal cost ₹{c.internalCost?.toLocaleString() ?? "—"}
              </p>
            </div>
            <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              {canActOnQueue ? "Needs pricing" : "Needs pricing (view only)"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
