import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClient } from "@/lib/rbac";
import CommunicationsThread from "@/components/campaign/CommunicationsThread";
import BackLink from "@/components/BackLink";

export default async function CampaignCommunicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      remarks: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      clientAccess: { include: { user: { select: { id: true, name: true } } } },
      teamMembers: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!campaign) notFound();

  if (isClient(user.role)) {
    const hasAccess = campaign.clientAccess.some((a) => a.userId === user.id);
    if (!hasAccess) notFound();
  }

  const remarks = isClient(user.role) ? campaign.remarks.filter((r) => r.visibility === "CLIENT") : campaign.remarks;

  // Anyone on this campaign — TBM team + client contacts — is taggable with
  // @, minus yourself.
  const mentionable = [
    ...campaign.teamMembers.map((m) => m.user),
    ...campaign.clientAccess.map((a) => a.user),
  ]
    .filter((u, i, arr) => u.id !== user.id && arr.findIndex((x) => x.id === u.id) === i);

  return (
    <div className="p-8">
      <BackLink label="Back" fallbackHref={`/campaigns/${campaign.id}`} />
      <h1 className="mt-1 text-lg font-semibold text-ink dark:text-white">{campaign.name}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{campaign.brand}</p>

      <div className="mt-6">
        <CommunicationsThread campaignId={campaign.id} remarks={remarks} mentionable={mentionable} />
      </div>
    </div>
  );
}
