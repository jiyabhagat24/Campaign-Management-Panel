import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canViewCampaignGates, isSuperAdmin } from "@/lib/rbac";
import { allPass, canReleaseFor, closureChecks } from "@/lib/gates";
import { Kpi, PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";
import { DbNotice, Pill } from "@/components/gaps/Ui";

// Campaign gates overview (gap build): release gates waiting on the Campaign
// Manager and closure readiness per campaign. Row scope follows assignment
// (G13). Internal only; clients never see this (G9).

export default async function CampaignGatesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewCampaignGates(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");

  let campaigns: any[];
  try {
    campaigns = await (prisma as any).campaign.findMany({
      where: { ...campaignVisibilityWhere(user), status: { in: ["ACTIVE", "ON_HOLD", "CLOSED"] } },
      select: {
        id: true, name: true, brand: true, status: true, reportPublished: true,
        closure: true,
        teamMembers: { where: { roleOnCampaign: "CAMPAIGN_MANAGER" }, select: { user: { select: { name: true } } } },
        creators: { select: { status: true, deliverables: { select: { id: true, scriptStatus: true, contentStatus: true, liveLink: true, lastTrackedAt: true, releases: { select: { kind: true } } } } } },
      },
      orderBy: { updatedAt: "desc" },
    });
  } catch {
    return <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8"><PageHeadline title="Campaign gates" subtitle="Release and closure" /><DbNotice what="Campaign gates" /></div>;
  }

  const rows = campaigns.map((c) => {
    const onb = c.creators.filter((cr: any) => cr.status === "ONBOARDED");
    const dels = onb.flatMap((cr: any) => cr.deliverables);
    const shoot = dels.filter((d: any) => canReleaseFor("SHOOT", d).ok).length;
    const publish = dels.filter((d: any) => canReleaseFor("PUBLISH", d).ok).length;
    const checks = closureChecks(c);
    const ready = allPass(checks);
    const stale = c.status === "CLOSED" && c.closure?.closedAt && !ready;
    return { c, dels, shoot, publish, checks, ready, stale };
  });
  const totalShoot = rows.reduce((s, r) => s + r.shoot, 0);
  const totalPublish = rows.reduce((s, r) => s + r.publish, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline title="Keep the next approval moving." subtitle="Campaign gates · release for shoot, release for publishing, closure" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="Ready for shoot release" value={totalShoot} hint="Script approved, not released" />
        <Kpi label="Ready for publishing release" value={totalPublish} hint="Video approved, not released" />
        <Kpi label="Ready to close" value={rows.filter((r) => r.c.status === "ACTIVE" && r.ready).length} hint="Every closure check passes" />
        <Kpi label="Closure needs a re-check" value={rows.filter((r) => r.stale).length} hint="Closed, but a check no longer passes" />
      </div>
      <SandboxCard title="Campaigns" footer="Closing needs the Campaign Manager to close execution and Finance to sign off. The checks are run again at each step.">
        <table className="w-full table-fixed text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={`w-[30%] ${thClass}`}>Campaign</th>
              <th className={`w-[18%] ${thClass}`}>Delivery</th>
              <th className={`w-[20%] ${thClass}`}>Releases waiting</th>
              <th className={`w-[20%] ${thClass}`}>Closure</th>
              <th className={`w-[12%] ${thClass}`}></th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No active or closed campaigns in your scope.</td></tr>}
            {rows.map(({ c, dels, shoot, publish, checks, ready, stale }) => (
              <tr key={c.id} className="align-top">
                <td className="px-5 py-3">
                  <Link href={`/campaign-gates/${c.id}`} className="block truncate font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">{c.name}</Link>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c.brand} · CM {c.teamMembers[0]?.user.name ?? "not assigned"}</p>
                </td>
                <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
                  <p>{dels.filter((d: any) => d.liveLink).length} of {dels.length} live</p>
                  <p className="text-slate-500 dark:text-slate-400">{c.status.replace("_", " ").toLowerCase()}</p>
                </td>
                <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
                  {shoot + publish === 0 ? <span className="text-slate-400">None</span> : (
                    <>
                      {shoot > 0 && <p>{shoot} for shoot</p>}
                      {publish > 0 && <p>{publish} for publishing</p>}
                    </>
                  )}
                </td>
                <td className="px-5 py-3">
                  {c.status === "CLOSED" ? (
                    stale ? <Pill tone="rose">Closed · re-check</Pill> : <Pill tone="dark">Closed</Pill>
                  ) : ready ? (
                    <Pill tone="gold">Ready</Pill>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{checks.filter((x) => x.ok).length} of {checks.length} checks</p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {c.closure?.executionClosedAt ? "Execution closed" : "Execution open"} · {c.closure?.financeSignedOffAt ? "Finance signed" : "Finance pending"}
                  </p>
                </td>
                <td className="px-5 py-3 text-right"><Link href={`/campaign-gates/${c.id}`} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Open →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SandboxCard>
    </div>
  );
}
