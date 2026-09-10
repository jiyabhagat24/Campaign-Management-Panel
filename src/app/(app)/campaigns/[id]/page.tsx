import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateCampaign, canSeeInternalCost, canViewCampaign, isClient, serializeCreatorsForClient, filterCreatorsForShortlistScope, isSuperAdmin } from "@/lib/rbac";
import CampaignHeaderEditor from "@/components/campaign/CampaignHeaderEditor";
import TeamRow from "@/components/campaign/TeamRow";
import ClientRow from "@/components/campaign/ClientRow";
import FinanceRow from "@/components/campaign/FinanceRow";
import CreatorKanban from "@/components/campaign/CreatorKanban";
import { isGoLiveAtRisk, isGoLiveBreached } from "@/lib/sla";
import { ArrowLeft, MessageSquare } from "lucide-react";

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
      platformBriefs: {
        include: { languageRequirements: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
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

  // serializeCreatorsForClient itself now filters out un-priced/rejected
  // rows (Gate G1) — see rbac.ts. Task #19: row-level Shortlisting scope for
  // IR Intern/Executive is applied on top, internal-side only (a client's
  // creators are already filtered to published rows above and isn't scoped
  // by sourcing — that's an internal-team concept).
  const campaignInternUserIds = campaign.teamMembers.filter((t) => t.user && t.roleOnCampaign === "IR_INTERN").map((t) => t.userId);
  const creators = isClientView
    ? serializeCreatorsForClient(campaign.creators)
    : filterCreatorsForShortlistScope(user, campaign.creators, campaignInternUserIds);

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
        <CampaignHeaderEditor
          campaign={{
            id: campaign.id,
            name: campaign.name,
            brand: campaign.brand,
            brandLogoUrl: campaign.brandLogoUrl,
            product: campaign.product,
            budgetQuoted: campaign.budgetQuoted,
            startDate: campaign.startDate ? campaign.startDate.toISOString() : null,
            goLiveDeadline: campaign.goLiveDeadline ? campaign.goLiveDeadline.toISOString() : null,
            brief: campaign.brief,
            platformBriefs: campaign.platformBriefs,
          }}
          canEdit={canCreateCampaign(user.role) || isSuperAdmin(user.id)}
          breached={breached}
          atRisk={atRisk}
        />

        {/* Team Members Row */}
        <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">TBM Members</p>
          <TeamRow
            campaignId={campaign.id}
            teamMembers={campaign.teamMembers}
            internalUsers={internalUsers}
            canEdit={user.role === "IR_MANAGER" || isSuperAdmin(user.id)}
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
        currentUserId={user.id}
        canSeeCost={canSeeCost}
        isClientView={isClientView}
        internalUsers={internalUsers}
        activityLogs={activityLogs as any}
      />
    </div>
  );
}
