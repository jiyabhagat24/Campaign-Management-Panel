import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSetCommercials, campaignVisibilityWhere, isSuperAdmin } from "@/lib/rbac";
import { DollarSign } from "lucide-react";

// Task #15 — Pricing Queue: every shortlist row still waiting on a Campaign
// Manager's vet decision (In Pricing → Published/Rejected, spec State
// Machine), Campaign-Manager-only per Page Permissions. Not a new table —
// just the existing Creator rows with internalCost set and no quotedCost
// yet, i.e. IR has submitted a row for pricing but nobody's vetted it.
export default async function PricingQueuePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canSetCommercials(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");

  const rows = await prisma.creator.findMany({
    where: {
      status: { notIn: ["REJECTED", "CLIENT_REJECTED"] },
      quotedCost: null,
      internalCost: { not: null },
      campaign: campaignVisibilityWhere(user),
    },
    include: { campaign: { select: { id: true, name: true, brand: true } } },
    orderBy: { createdAt: "asc" },
  });

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

      <div className="space-y-2">
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
              Needs pricing
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
