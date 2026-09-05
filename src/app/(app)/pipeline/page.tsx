import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClient } from "@/lib/rbac";
import { KANBAN_COLUMNS, KANBAN_COLUMN_LABELS, type KanbanColumn } from "@/lib/constants";
import { isGoLiveAtRisk, isGoLiveBreached } from "@/lib/sla";
import { campaignColumn } from "@/lib/kanban";
import BrandAvatar from "@/components/campaign/BrandAvatar";
import { GitMerge, AlertCircle, ArrowUpRight, CheckCircle2 } from "lucide-react";

const COLUMN_THEMES: Record<KanbanColumn, { dot: string; bar: string; badge: string }> = {
  SHORTLIST: {
    dot: "bg-amber-500",
    bar: "bg-gradient-to-r from-amber-500 to-orange-500",
    badge: "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60",
  },
  ONBOARDING: {
    dot: "bg-indigo-500",
    bar: "bg-gradient-to-r from-indigo-500 to-violet-500",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60",
  },
  REPORT: {
    dot: "bg-emerald-500",
    bar: "bg-gradient-to-r from-emerald-500 to-teal-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60",
  },
};

export default async function PipelinePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (isClient(user.role)) redirect("/dashboard");

  const campaigns = await prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    include: { creators: { include: { deliverables: { select: { liveLink: true } } } } },
    orderBy: { updatedAt: "desc" },
  });

  const byColumn: Record<KanbanColumn, typeof campaigns> = { SHORTLIST: [], ONBOARDING: [], REPORT: [] };
  for (const c of campaigns) byColumn[campaignColumn(c.creators)].push(c);

  return (
    <div className="flex h-screen flex-col p-8 overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200/60 dark:border-slate-800 pb-5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-0.5 dark:bg-indigo-950/80 dark:border-indigo-800/80 dark:text-indigo-300">
            Stage Rollup
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{campaigns.length} Active Campaigns</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <GitMerge className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          Campaign Pipeline
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every active campaign rolled up to the furthest stage reached by its creators.
        </p>
      </div>

      {/* Kanban Board Columns */}
      <div className="mt-6 flex flex-1 gap-6 overflow-x-auto pb-4 items-start">
        {KANBAN_COLUMNS.map((col) => {
          const items = byColumn[col];
          const theme = COLUMN_THEMES[col];

          return (
            <div
              key={col}
              className="flex w-96 flex-shrink-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-100/50 dark:bg-slate-900/60 dark:border-slate-800 shadow-xs max-h-full overflow-hidden"
            >
              {/* Column Top Accent Bar */}
              <div className={`h-1.5 w-full ${theme.bar}`} />

              {/* Column Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    {KANBAN_COLUMN_LABELS[col]}
                  </span>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${theme.badge}`}>
                  {items.length}
                </span>
              </div>

              {/* Column Cards */}
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {items.map((c) => {
                  const atRisk = isGoLiveAtRisk(c.goLiveDeadline);
                  const breached = isGoLiveBreached(c.goLiveDeadline);
                  const onboarded = c.creators.filter((cr) => cr.status === "ONBOARDED").length;

                  return (
                    <Link
                      key={c.id}
                      href={`/campaigns/${c.id}`}
                      className="group block rounded-xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-card transition-all duration-200 hover:shadow-card-hover dark:hover:bg-slate-800/60 hover:-translate-y-0.5"
                    >
                      <div className="flex items-start gap-3">
                        <BrandAvatar brand={c.brand} logoUrl={c.brandLogoUrl} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="truncate text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {c.name}
                            </p>
                            <ArrowUpRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" />
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{c.brand}</p>

                          <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2.5 font-medium">
                            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              {onboarded} / {c.creators.length} creators
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {c.budgetQuoted ? `₹${(c.budgetQuoted / 100000).toFixed(1)}L` : "—"}
                            </span>
                          </div>

                          {(atRisk || breached) && (
                            <div
                              className={`mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                                breached
                                  ? "bg-rose-50 border border-rose-200 text-rose-600 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-400"
                                  : "bg-amber-50 border border-amber-200 text-amber-600 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-400"
                              }`}
                            >
                              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                              <span>{breached ? "Go-live SLA Breached" : "Go-live At Risk"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {items.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
                    No active campaigns in this stage.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
