import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere } from "@/lib/rbac";
import Link from "next/link";

// Page Permissions matrix: every non-CXO/IR-Manager internal role sees "own
// campaigns" here, not every campaign in the system — this previously ran
// an unscoped findMany for anyone who wasn't a client, so a Campaign
// Manager or Brand Solutions user could see every other team's campaigns
// too. campaignVisibilityWhere already encodes the right scope per role
// (client -> clientAccess, CXO/IR Manager -> org-wide, everyone else ->
// their own CampaignTeamMember rows) — same helper the Campaigns directory
// and Pipeline already use.
export default async function ReportsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const campaigns = await prisma.campaign.findMany({
    where: campaignVisibilityWhere(user),
    include: { creators: { include: { deliverables: true } } },
  });

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-ink">Reports</h1>
      <p className="mt-1 text-sm text-slate-500">Per-campaign report is inside each campaign's Reports tab. Cross-campaign summary below.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {campaigns.map((c) => {
          const onboarded = c.creators.filter((cr) => cr.status === "ONBOARDED");
          const live = onboarded.flatMap((cr) => cr.deliverables).filter((d) => d.liveLink);
          const totalViews = live.reduce((s, d) => s + (d.views ?? 0), 0);
          return (
            <Link key={c.id} href={`/campaigns/${c.id}`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-brand">
              <p className="text-sm font-semibold text-ink">{c.name}</p>
              <p className="text-xs text-slate-400">{c.brand}</p>
              <div className="mt-3 flex gap-4 text-xs text-slate-600">
                <span>{onboarded.length} creators</span>
                <span>{live.length} live posts</span>
                <span>{totalViews.toLocaleString("en-IN")} views</span>
              </div>
            </Link>
          );
        })}
        {campaigns.length === 0 && <p className="text-sm text-slate-400">No campaigns yet.</p>}
      </div>
    </div>
  );
}
