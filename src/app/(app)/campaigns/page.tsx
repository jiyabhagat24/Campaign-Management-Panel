import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canCreateCampaign, canDeleteCampaign, isClient, isSuperAdmin } from "@/lib/rbac";
import { campaignColumnLabel } from "@/lib/kanban";
import CampaignStatusSelect from "@/components/campaign/CampaignStatusSelect";
import DeleteCampaignButton from "@/components/campaign/DeleteCampaignButton";
import { isGoLiveAtRisk, isGoLiveBreached } from "@/lib/sla";
import { Plus, ArrowUpRight } from "lucide-react";
import { PageHeadline, SandboxCard, primaryActionClass, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";

export default async function CampaignsPage() {
  const user = await currentUser();
  if (!user) return null;

  // Campaign visibility: clients see their own, CXO sees every campaign,
  // and every other internal role only sees campaigns they're assigned to.
  const campaigns = await prisma.campaign.findMany({
    where: campaignVisibilityWhere(user),
    include: { creators: { select: { status: true, deliverables: { select: { liveLink: true } } } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline
        title="Campaigns."
        subtitle="Every campaign you can see, one row each. Open a row to manage creators, deliverables and reporting."
        aside={
          (canCreateCampaign(user.role) || isSuperAdmin(user.id)) && (
            <Link href="/campaigns/new" className={primaryActionClass}>
              <Plus className="h-4 w-4" />
              <span>New campaign</span>
            </Link>
          )
        }
      />

      <SandboxCard title="All campaigns" aside={<span className="text-xs text-slate-500 dark:text-slate-400">{campaigns.length} records</span>}>
        <table className="w-full table-fixed text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={`w-[32%] ${thClass}`}>Campaign / brand</th>
              <th className={`w-[18%] ${thClass}`}>Stage / creators</th>
              <th className={`w-[18%] ${thClass}`}>Budget (quoted)</th>
              <th className={`w-[32%] ${thClass} text-right`}>Status / actions</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {campaigns.map((c) => {
              const columnLabel = campaignColumnLabel(c.creators);
              const breached = isGoLiveBreached(c.goLiveDeadline);
              const atRisk = isGoLiveAtRisk(c.goLiveDeadline);
              const creatorCount = c.creators.filter((cr) => cr.status !== "REJECTED").length;
              return (
                <tr key={c.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3">
                    <Link href={`/campaigns/${c.id}`} className="block truncate font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">
                      {c.name}
                    </Link>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {c.brand}
                      {(breached || atRisk) && (
                        <span className={breached ? "font-semibold text-rose-600 dark:text-rose-400" : "font-semibold text-amber-600 dark:text-amber-400"}>
                          {" · "}{breached ? "Go-live breached" : "Go-live at risk"}
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-slate-700 dark:text-slate-300">{columnLabel}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{creatorCount} creator{creatorCount === 1 ? "" : "s"}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-slate-700 dark:text-slate-300">{c.budgetQuoted ? `₹${c.budgetQuoted.toLocaleString("en-IN")}` : "—"}</p>
                    <p className="text-xs capitalize text-slate-500 dark:text-slate-400">{c.status.replace("_", " ").toLowerCase()}</p>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      {!isClient(user.role) && <CampaignStatusSelect campaignId={c.id} status={c.status} />}
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span>Manage</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                      {(canDeleteCampaign(user.role) || isSuperAdmin(user.id)) && <DeleteCampaignButton campaignId={c.id} campaignName={c.name} />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No campaigns yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </SandboxCard>
    </div>
  );
}
