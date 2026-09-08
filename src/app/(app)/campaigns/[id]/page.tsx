import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateCampaign, canSeeInternalCost, canViewCampaign, isClient, serializeCreatorsForClient } from "@/lib/rbac";
import BriefEditor from "@/components/campaign/BriefEditor";
import BrandAvatar from "@/components/campaign/BrandAvatar";
import TeamRow from "@/components/campaign/TeamRow";
import ClientRow from "@/components/campaign/ClientRow";
import FinanceRow from "@/components/campaign/FinanceRow";
import CreatorKanban from "@/components/campaign/CreatorKanban";
import { isGoLiveAtRisk, isGoLiveBreached } from "@/lib/sla";
import { ArrowLeft, Calendar, AlertTriangle, MessageSquare, IndianRupee, Clock } from "lucide-react";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      creators: {
        include: {
          negotiationRounds: { orderBy: { roundNumber: "asc" } },
          deliverables: true,
          shortlistDeliverables: { orderBy: { createdAt: "asc" } },
          poc: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      clientAccess: { include: { client: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      teamMembers: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      languageRequirements: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!campaign) notFound();

  // Clients need clientAccess; CXO sees every campaign; every other
  // internal role needs to be a team member on this specific campaign.
  // Bounced back to their own campaigns list rather than a 404 — the point
  // is that an unassigned campaign just doesn't exist on their pages, not
  // that hitting the URL directly should look like a broken link/error.
  if (!canViewCampaign(user, campaign)) redirect("/campaigns");

  // The User table is internal-staff-only now (clients live in their own
  // Client table), so no role filter is needed here anymore.
  const internalUsers = isClient(user.role)
    ? []
    : await prisma.user.findMany({
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      });

  const canSeeCost = canSeeInternalCost(user.role);
  const isClientView = isClient(user.role);

  const creators = isClientView ? serializeCreatorsForClient(campaign.creators) : campaign.creators;

  // Onboarding tab derives "Last Action" / status-history / overdue-dormant
  // flags entirely from the audit trail — no separate columns needed for
  // that. Client view doesn't need any of this internal operational detail.
  const activityLogs = isClientView
    ? []
    : await prisma.activityLog.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: "desc" },
        take: 500,
      });

  const atRisk = isGoLiveAtRisk(campaign.goLiveDeadline);
  const breached = isGoLiveBreached(campaign.goLiveDeadline);

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Back button */}
      <div>
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Campaigns</span>
        </Link>
      </div>

      {/* Hero Header Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card dark:bg-slate-900 dark:border-slate-800">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <BrandAvatar brand={campaign.brand} logoUrl={campaign.brandLogoUrl} size={52} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-0.5 dark:bg-indigo-950/80 dark:border-indigo-800/80 dark:text-indigo-300">
                  {campaign.brand}
                </span>
                {breached && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-600 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300">
                    <AlertTriangle className="h-3 w-3" /> SLA Breached
                  </span>
                )}
                {!breached && atRisk && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" /> SLA At Risk
                  </span>
                )}
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{campaign.name}</h1>

              {/* Structured brief chips — Product / Category / Platform /
                  Deliverables / Budget per creator, matching how briefs like
                  the Atomberg one actually arrive. Only shown when set, so
                  older free-text-only campaigns render exactly as before. */}
              {(campaign.product || campaign.category || campaign.platformMix || campaign.deliverables || campaign.budgetPerCreatorMin || campaign.budgetPerCreatorMax) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {campaign.product && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {campaign.product}
                    </span>
                  )}
                  {campaign.category && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {campaign.category}
                    </span>
                  )}
                  {campaign.platformMix && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {campaign.platformMix}
                    </span>
                  )}
                  {campaign.deliverables && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {campaign.deliverables}
                    </span>
                  )}
                  {(campaign.budgetPerCreatorMin || campaign.budgetPerCreatorMax) && (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                      ₹{campaign.budgetPerCreatorMin ? `${campaign.budgetPerCreatorMin.toLocaleString("en-IN")}–` : ""}
                      {campaign.budgetPerCreatorMax ? campaign.budgetPerCreatorMax.toLocaleString("en-IN") : "max"} / creator
                    </span>
                  )}
                </div>
              )}

              <BriefEditor campaignId={campaign.id} initial={campaign.brief} canEdit={canCreateCampaign(user.role)} />

              {/* Language-wise requirement breakdown, e.g. "Hindi – 4",
                  "Tamil – 3" ... plus the running total. */}
              {campaign.languageRequirements.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {campaign.languageRequirements.map((r) => (
                    <span
                      key={r.id}
                      className="rounded-lg bg-violet-50 border border-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:border-violet-800/80 dark:text-violet-300"
                    >
                      {r.language} · {r.creatorsRequired}
                    </span>
                  ))}
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Total: {campaign.totalCreatorsRequired ?? campaign.languageRequirements.reduce((s, r) => s + r.creatorsRequired, 0)} creators
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:flex-col md:items-end flex-shrink-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800 pt-4 md:pt-0">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300">
              <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Came in:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString("en-IN") : "—"}
              </span>
            </div>

            <div className={`flex items-center gap-2 text-xs font-medium border rounded-xl px-3 py-2 ${
              breached ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-300" : atRisk ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300" : "bg-slate-50 border-slate-200/70 text-slate-600 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300"
            }`}>
              <Clock className="h-4 w-4" />
              <span>Deadline:</span>
              <span className="font-bold">
                {campaign.goLiveDeadline ? new Date(campaign.goLiveDeadline).toLocaleDateString("en-IN") : "—"}
              </span>
            </div>

            {campaign.budgetQuoted && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300">
                <IndianRupee className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Budget: ₹{campaign.budgetQuoted.toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Team Members Row */}
        <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">TBM Members</p>
          <TeamRow
            campaignId={campaign.id}
            teamMembers={campaign.teamMembers}
            internalUsers={internalUsers}
            canEdit={!isClientView}
          />
        </div>

        <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Client</p>
          <ClientRow
            campaignId={campaign.id}
            clientAccess={campaign.clientAccess}
            canAdd={isClientView}
            canRemove={!isClientView}
          />
        </div>

        {canSeeCost && (
          <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Finance</p>
            <FinanceRow
              campaignId={campaign.id}
              canEdit={canSeeCost}
              initial={{
                financeYetToBeInvoiced: campaign.financeYetToBeInvoiced,
                financeYetToBeReceived: campaign.financeYetToBeReceived,
                financeValueOfClearedDue: campaign.financeValueOfClearedDue,
                financeCreatorPayablePending: campaign.financeCreatorPayablePending,
                financeAgencyFee: campaign.financeAgencyFee,
                financeAgencyFeePercent: campaign.financeAgencyFeePercent,
                financeClientInvoiceStatus: campaign.financeClientInvoiceStatus,
              }}
            />
          </div>
        )}

        {!isClientView && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
            <Link
              href={`/communications/${campaign.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400"
            >
              <MessageSquare className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>View Campaign Communication Thread & Remarks</span>
            </Link>
          </div>
        )}
      </div>

      {/* Creator Kanban Workspace */}
      <CreatorKanban
        campaignId={campaign.id}
        campaignName={campaign.name}
        campaignBrand={campaign.brand}
        campaignStartDate={campaign.startDate}
        creators={creators as any}
        role={user.role}
        canSeeCost={canSeeCost}
        isClientView={isClientView}
        internalUsers={internalUsers}
        activityLogs={activityLogs as any}
      />
    </div>
  );
}
