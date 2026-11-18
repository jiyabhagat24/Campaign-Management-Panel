import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canSeeInternalCost, canViewCreatorBoard, isSuperAdmin } from "@/lib/rbac";
import { effectiveDeadlineMs } from "@/lib/irDashboard";
import CreatorBoardClient, { type BoardRow } from "@/components/management/CreatorBoardClient";

// Compact creator board (sandbox audit, Phase 3). Five primary columns with
// the full record opening inside the row, so routine work never scrolls
// sideways. New page; the existing creator tables are unchanged.
// Cost is never sent to roles that can't see it (not just hidden in the UI).

export default async function CreatorBoardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewCreatorBoard(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");
  const showInternal = canSeeInternalCost(user.role);
  const showQuoted = user.role !== "IR_INTERN"; // Gate G3: no quoted cost on the Intern login
  const ownOnly = user.role === "IR_EXECUTIVE" || user.role === "IR_INTERN";

  const creators = await prisma.creator.findMany({
    where: {
      campaign: { ...campaignVisibilityWhere(user), status: { notIn: ["CANCELLED"] } },
      status: { notIn: ["REJECTED", "CLIENT_REJECTED"] },
      ...(ownOnly ? { OR: [{ sourcedByUserId: user.id }, { pocUserId: user.id }] } : {}),
    },
    select: {
      id: true, name: true, channelHandle: true, status: true, ballOwner: true, goLiveDeadline: true, onboardedAt: true,
      internalCost: true, quotedCost: true, finalQuotedCost: true, payoutPaymentStatus: true, clientIntent: true,
      campaign: { select: { id: true, name: true, brand: true } },
      sourcedBy: { select: { name: true } },
      poc: { select: { name: true } },
      deliverables: {
        select: {
          id: true, platform: true, title: true, productStatus: true, scriptDocUrl: true, scriptStatus: true,
          contentStatus: true, reviewLink: true, liveLink: true, liveDate: true, views: true, likes: true, comments: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const rows: BoardRow[] = creators.map((cr) => ({
    id: cr.id,
    name: cr.name,
    handle: cr.channelHandle,
    status: cr.status,
    ballOwner: cr.ballOwner,
    campaignId: cr.campaign.id,
    campaign: cr.campaign.name,
    brand: cr.campaign.brand,
    owner: cr.poc?.name ?? cr.sourcedBy?.name ?? null,
    deadline: cr.status === "ONBOARDED" ? (effectiveDeadlineMs(cr) ? new Date(effectiveDeadlineMs(cr) as number).toISOString() : null) : null,
    internalCost: showInternal ? cr.internalCost : null,
    quoted: showQuoted ? cr.finalQuotedCost ?? cr.quotedCost : null,
    locked: cr.finalQuotedCost !== null,
    payment: showInternal ? cr.payoutPaymentStatus : null,
    clientIntent: cr.clientIntent,
    deliverables: cr.deliverables.map((d) => ({ ...d, liveDate: d.liveDate ? d.liveDate.toISOString() : null })),
  }));

  return <CreatorBoardClient rows={rows} showInternal={showInternal} showQuoted={showQuoted} nowIso={new Date().toISOString()} />;
}
