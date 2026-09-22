import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClient } from "@/lib/rbac";
import CampaignReport from "@/components/campaign/CampaignReport";
import BrandAvatar from "@/components/campaign/BrandAvatar";
import { ArrowLeft } from "lucide-react";

// Read-only report view for a campaign, reachable even by internal staff
// who AREN'T on the campaign's team — that's the whole point of this route
// existing separately from /campaigns/[id]. The Pipeline board shows every
// active campaign to every internal user for context, greyed out and
// unclickable for anyone not assigned; this is what a greyed-out card links
// to instead of the full (team-only) campaign workspace. Only ever fetches
// report-safe fields (finalQuotedCost + public performance numbers, via
// ReportCreator/ReportDeliverable) — never internalCost/quotedCost, so it
// can't leak pre-negotiation cost or margin to someone who isn't on the deal.
export default async function CampaignReportOnlyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      brand: true,
      brandLogoUrl: true,
      startDate: true,
      clientAccess: { select: { clientId: true } },
      creators: {
        where: { status: { in: ["ONBOARDED", "BLOCKED"] } },
        select: {
          id: true,
          name: true,
          channelHandle: true,
          profileUrl: true,
          youtubeUrl: true,
          platformPrimary: true,
          followers: true,
          youtubeSubscribers: true,
          finalQuotedCost: true,
          deliverables: {
            select: {
              id: true,
              platform: true,
              title: true,
              liveLink: true,
              liveDate: true,
              views: true,
              likes: true,
              comments: true,
              shares: true,
              lastTrackedAt: true,
            },
          },
        },
      },
    },
  });
  if (!campaign) notFound();

  // Clients already have a full report view (the Report tab on their own
  // /campaigns/[id] page, gated by clientAccess) — this route is for
  // internal staff without a team assignment, so send a client to the page
  // they're actually meant to use instead of duplicating it here.
  if (isClient(user.role)) {
    const hasAccess = campaign.clientAccess.some((a) => a.clientId === user.id);
    redirect(hasAccess ? `/campaigns/${id}` : "/dashboard");
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <Link
          href="/pipeline"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Pipeline</span>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card dark:bg-slate-900 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <BrandAvatar brand={campaign.brand} logoUrl={campaign.brandLogoUrl} size={40} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{campaign.brand}</p>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{campaign.name}</h1>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          You're not on this campaign's team, so this is a read-only report — no shortlist, cost, or team detail.
        </p>
      </div>

      <CampaignReport
        campaignName={campaign.name}
        campaignBrand={campaign.brand}
        campaignStartDate={campaign.startDate ? campaign.startDate.toISOString() : null}
        onboarding={campaign.creators}
      />
    </div>
  );
}
