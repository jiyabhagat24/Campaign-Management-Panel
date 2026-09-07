import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canCreateCampaign, isClient } from "@/lib/rbac";
import { campaignColumnLabel } from "@/lib/kanban";
import BrandAvatar from "@/components/campaign/BrandAvatar";
import CampaignStatusSelect from "@/components/campaign/CampaignStatusSelect";
import { isGoLiveAtRisk, isGoLiveBreached } from "@/lib/sla";
import { FolderKanban, Plus, Users, ArrowUpRight } from "lucide-react";

export default async function CampaignsPage() {
  const user = await currentUser();
  if (!user) return null;

  // Campaign visibility: clients see their own, CXO sees every campaign,
  // and every other internal role only sees campaigns they're assigned to.
  const campaigns = await prisma.campaign.findMany({
    where: campaignVisibilityWhere(user),
    include: { creators: { include: { deliverables: { select: { liveLink: true } } } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-0.5 dark:bg-indigo-950/80 dark:border-indigo-800/80 dark:text-indigo-300">
              Portfolio
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{campaigns.length} Total Campaigns</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Campaigns Directory</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your active brand campaigns, creator assignments, and live SLA deadlines.
          </p>
        </div>

        {canCreateCampaign(user.role) && (
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:from-indigo-700 hover:to-indigo-800 hover:shadow-indigo-600/30 hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            <span>New Campaign</span>
          </Link>
        )}
      </div>

      {/* Modern Table Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4">Campaign Name</th>
                <th className="px-6 py-4">Brand</th>
                <th className="px-6 py-4">Stage</th>
                <th className="px-6 py-4">Creators</th>
                <th className="px-6 py-4">Budget (Quoted)</th>
                <th className="px-6 py-4 w-[260px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
              {campaigns.map((c) => {
                const columnLabel = campaignColumnLabel(c.creators);
                const breached = isGoLiveBreached(c.goLiveDeadline);
                const atRisk = isGoLiveAtRisk(c.goLiveDeadline);

                return (
                  <tr key={c.id} className="group transition-colors hover:bg-indigo-50/30 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4">
                      <Link href={`/campaigns/${c.id}`} className="flex items-center gap-3">
                        <BrandAvatar brand={c.brand} logoUrl={c.brandLogoUrl} size={36} />
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {c.name}
                          </p>
                          {(breached || atRisk) && (
                            <p className={`text-[11px] font-bold ${breached ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                              {breached ? "• Go-live breached" : "• Go-live at risk"}
                            </p>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-medium">{c.brand}</td>
                    <td className="px-6 py-4">
                      <span className="badge bg-indigo-50 border border-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300 font-bold">
                        {columnLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <Users className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                        {c.creators.length}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-900 dark:text-white font-semibold">
                      {c.budgetQuoted ? `₹${c.budgetQuoted.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {!isClient(user.role) && <CampaignStatusSelect campaignId={c.id} status={c.status} />}
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300"
                        >
                          <span>Manage</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                    <FolderKanban className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-medium">No campaigns found in directory.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
