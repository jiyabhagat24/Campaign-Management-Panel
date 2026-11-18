import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewIrManagerHome, isSuperAdmin } from "@/lib/rbac";
import { formatCompactINR } from "@/lib/format";
import { ROLE_DISPLAY_NAMES, type Role } from "@/lib/constants";
import { effectiveDeadlineMs } from "@/lib/irDashboard";
import { Kpi, PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";
import { ExceptionsCard, ExecutionSnapshotCard, PaymentPipelineCard, type Exception } from "@/components/management/Cards";
import {
  DAY_MS,
  cmName,
  creatorPaymentPipeline,
  executionSnapshot,
  isCreatorDelayed,
  loadCampaigns,
  riskReasons,
  upcomingMilestoneExposure,
} from "@/lib/managementData";

// IR Manager home (sandbox audit, Phase 2). Lands the IR Manager on team
// health and exceptions instead of a longer copy of the IRE queue.
// New page; the existing /dashboard is unchanged.
//
// Team scope: the IR Manager plus everyone below them in the reporting tree
// (User.managerId). Until reporting lines are set, every CM and IR-role
// person is in scope, and the page says so.

const TEAM_ROLES = ["CAMPAIGN_MANAGER", "IR_MANAGER", "IR_EXECUTIVE", "IR_INTERN"];
const IR_ROLES = ["IR_EXECUTIVE", "IR_INTERN"];

export default async function IrManagerHomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewIrManagerHome(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");
  const now = Date.now();

  let users: { id: string; name: string; role: string; managerId: string | null }[];
  try {
    users = await (prisma as any).user.findMany({ select: { id: true, name: true, role: true, managerId: true } });
  } catch {
    users = (await prisma.user.findMany({ select: { id: true, name: true, role: true } })).map((u) => ({ ...u, managerId: null }));
  }
  const children = new Map<string, string[]>();
  for (const u of users) if (u.managerId) children.set(u.managerId, [...(children.get(u.managerId) ?? []), u.id]);
  const scope = new Set<string>([user.id]);
  const queue = [user.id];
  while (queue.length) for (const c of children.get(queue.shift() as string) ?? []) if (!scope.has(c)) { scope.add(c); queue.push(c); }
  const fallback = scope.size === 1;
  if (fallback) for (const u of users) if (TEAM_ROLES.includes(u.role)) scope.add(u.id);
  const team = users.filter((u) => scope.has(u.id) && TEAM_ROLES.includes(u.role));
  const teamIds = team.map((u) => u.id);

  const campaigns = await loadCampaigns({ status: "ACTIVE", teamMembers: { some: { userId: { in: teamIds } } } });
  const campaignIds = campaigns.map((c) => c.id);
  const escalations = await prisma.escalation.findMany({
    where: { status: { not: "CLOSED" }, campaignId: { in: campaignIds } },
    select: { campaignId: true, severity: true, ownerId: true },
  });

  const onboarded = campaigns.flatMap((c) => c.creators.filter((cr) => cr.status === "ONBOARDED").map((cr) => ({ ...cr, campaign: c })));
  const delayed = onboarded.filter((cr) => isCreatorDelayed(cr, now));
  const snap = executionSnapshot(onboarded.flatMap((cr) => cr.deliverables));
  const pipeline = await creatorPaymentPipeline(campaignIds, campaigns, now);
  const upcoming = await upcomingMilestoneExposure(onboarded.map((cr) => cr.id), now, 14);

  // Campaigns at risk, each with its reason and owner.
  const highBy = new Map<string, number>();
  for (const e of escalations) if ((e.severity ?? "").toUpperCase() === "HIGH") highBy.set(e.campaignId, (highBy.get(e.campaignId) ?? 0) + 1);
  const atRisk: Exception[] = campaigns
    .map((c) => ({ c, reasons: riskReasons(c, now, highBy.get(c.id) ?? 0) }))
    .filter((x) => x.reasons.length)
    .sort((a, b) => b.reasons.length - a.reasons.length)
    .map(({ c, reasons }) => ({
      tone: reasons.length > 1 || (highBy.get(c.id) ?? 0) > 0 ? "high" : "medium",
      title: `${c.brand} · ${c.name}`,
      reason: `${reasons.join(", ")} · CM ${cmName(c) ?? "not assigned"}`,
      href: `/campaigns/${c.id}`,
    }));

  // Bottlenecks by owner — open creators per IR person, split by who the
  // ball is with right now.
  const open = onboarded.filter((cr) => cr.deliverables.some((d) => !d.liveLink));
  const bottlenecks = team
    .filter((u) => IR_ROLES.includes(u.role) || u.role === "IR_MANAGER")
    .map((u) => {
      const mine = open.filter((cr) => cr.sourcedByUserId === u.id);
      return {
        u,
        total: mine.length,
        internal: mine.filter((cr) => cr.ballOwner === "TBM").length,
        creator: mine.filter((cr) => cr.ballOwner === "CREATOR").length,
        client: mine.filter((cr) => cr.ballOwner === "CLIENT").length,
        delayed: mine.filter((cr) => isCreatorDelayed(cr, now)).length,
      };
    })
    .filter((b) => b.total > 0 || IR_ROLES.includes(b.u.role))
    .sort((a, b) => b.delayed - a.delayed || b.total - a.total);

  // Scorecard — evidence that exists today. On-time = first live on or
  // before the creator's go-live deadline, for creators onboarded in the
  // last 90 days that have gone live.
  const allCreators = await prisma.creator.findMany({
    where: { status: "ONBOARDED", onboardedAt: { gte: new Date(now - 90 * DAY_MS) }, campaign: { teamMembers: { some: { userId: { in: teamIds } } } } },
    select: {
      sourcedByUserId: true,
      goLiveDeadline: true,
      onboardedAt: true,
      campaign: { select: { teamMembers: { where: { roleOnCampaign: "CAMPAIGN_MANAGER" }, select: { userId: true } } } },
      deliverables: { select: { liveDate: true } },
    },
  });
  function score(pred: (cr: (typeof allCreators)[number]) => boolean) {
    const live = allCreators.filter(pred).flatMap((cr) => {
      const dates = cr.deliverables.map((d) => d.liveDate).filter((d): d is Date => Boolean(d));
      if (!dates.length || !cr.onboardedAt) return [];
      const first = Math.min(...dates.map((d) => d.getTime()));
      const deadline = effectiveDeadlineMs(cr);
      return [{ days: (first - cr.onboardedAt.getTime()) / DAY_MS, onTime: deadline === null || first <= deadline }];
    });
    return {
      n: live.length,
      onTime: live.length ? (live.filter((x) => x.onTime).length / live.length) * 100 : null,
      avg: live.length ? live.reduce((s, x) => s + x.days, 0) / live.length : null,
    };
  }
  const escBy = new Map<string, number>();
  for (const e of escalations) if (e.ownerId) escBy.set(e.ownerId, (escBy.get(e.ownerId) ?? 0) + 1);
  const scorecard = team
    .filter((u) => u.role !== "IR_MANAGER" || u.id !== user.id)
    .map((u) => {
      const isIr = IR_ROLES.includes(u.role);
      const load = isIr
        ? onboarded.filter((cr) => cr.sourcedByUserId === u.id).length
        : campaigns.filter((c) => c.teamMembers.some((t) => t.userId === u.id && t.roleOnCampaign === "CAMPAIGN_MANAGER")).length;
      const s = isIr ? score((cr) => cr.sourcedByUserId === u.id) : score((cr) => cr.campaign.teamMembers.some((t) => t.userId === u.id));
      const dl = isIr
        ? delayed.filter((cr) => cr.sourcedByUserId === u.id).length
        : delayed.filter((cr) => cr.campaign.teamMembers.some((t) => t.userId === u.id && t.roleOnCampaign === "CAMPAIGN_MANAGER")).length;
      return { u, isIr, load, delayed: dl, esc: escBy.get(u.id) ?? 0, ...s };
    })
    .sort((a, b) => Number(a.isIr) - Number(b.isIr) || a.u.name.localeCompare(b.u.name));

  const chip = (n: number, label: string, tone: string) =>
    n > 0 ? <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{n} {label}</span> : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline title="Clear bottlenecks. Keep teams moving." subtitle={`Campaign health and team capacity · ${team.length} people in your team${fallback ? " (no reporting lines set yet, showing every CM and IR team member)" : ""}`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="Active campaigns" value={campaigns.length} hint={`${atRisk.length} at risk`} />
        <Kpi label="Creator records" value={onboarded.length} hint={`${open.length} with content still to go live`} />
        <Kpi label="Delayed creators" value={delayed.length} hint="Go-live passed, not all live" />
        <Kpi
          label={upcoming !== null ? "Creator payments due in 14 days" : "Creator payouts unpaid"}
          value={formatCompactINR(upcoming ?? pipeline.unpaid)}
          hint={upcoming !== null ? "Unpaid milestones from the finance ledger" : "From payout status on onboarded creators"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ExceptionsCard title="Campaigns at risk" items={atRisk} emptyText="No active campaign in your team is at risk right now." />
        </div>
        <ExecutionSnapshotCard snap={snap} />
      </div>

      <SandboxCard
        title="Bottlenecks by owner"
        aside={
          <Link href="/team-turnaround" className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            Reassign on Team & turnaround →
          </Link>
        }
        footer="Open creators = onboarded creators with at least one deliverable not live yet, owned by whoever sourced them. Waiting-on comes from each creator's ball owner."
      >
        <table className="w-full table-fixed text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={`w-[30%] ${thClass}`}>Person</th>
              <th className={`w-[15%] ${thClass}`}>Open creators</th>
              <th className={`w-[40%] ${thClass}`}>Waiting on</th>
              <th className={`w-[15%] ${thClass}`}>Delayed</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {bottlenecks.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No IR team members in scope.</td>
              </tr>
            )}
            {bottlenecks.map((b) => (
              <tr key={b.u.id}>
                <td className="px-5 py-3">
                  <p className="truncate font-semibold text-slate-900 dark:text-white">{b.u.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{ROLE_DISPLAY_NAMES[b.u.role as Role] ?? b.u.role}</p>
                </td>
                <td className="px-5 py-3 font-bold text-slate-900 dark:text-white">{b.total}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {chip(b.internal, "internal", "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}
                    {chip(b.creator, "creator", "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300")}
                    {chip(b.client, "client", "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300")}
                    {b.total === 0 && <span className="text-xs text-slate-400 dark:text-slate-500">Nothing open</span>}
                  </div>
                </td>
                <td className={`px-5 py-3 font-bold ${b.delayed ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"}`}>{b.delayed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SandboxCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SandboxCard
            title="Team scorecard"
            footer="On-time and average go-live use creators onboarded in the last 90 days that have gone live. CM figures cover campaigns they manage; IR figures cover creators they sourced. Client waiting time isn't separated yet, so these are not rankings."
          >
            <table className="w-full table-fixed text-sm">
              <thead className={theadClass}>
                <tr>
                  <th className={`w-[28%] ${thClass}`}>Person</th>
                  <th className={`w-[18%] ${thClass}`}>Load</th>
                  <th className={`w-[18%] ${thClass}`}>On time</th>
                  <th className={`w-[18%] ${thClass}`}>Onboard → live</th>
                  <th className={`w-[18%] ${thClass}`}>Attention</th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {scorecard.map((s) => (
                  <tr key={s.u.id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="truncate font-semibold text-slate-900 dark:text-white">{s.u.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{ROLE_DISPLAY_NAMES[s.u.role as Role] ?? s.u.role}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                      {s.load} {s.isIr ? "creators" : "campaigns"}
                    </td>
                    <td className="px-5 py-3">
                      <p className={`font-bold ${s.onTime !== null && s.onTime < 70 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>
                        {s.onTime === null ? "—" : `${Math.round(s.onTime)}%`}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{s.n} went live</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{s.avg === null ? "—" : `${s.avg.toFixed(1)}d avg`}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col items-start gap-1">
                        {chip(s.delayed, "delayed", "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300")}
                        {chip(s.esc, s.esc === 1 ? "escalation" : "escalations", "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300")}
                        {!s.delayed && !s.esc && <span className="text-xs text-slate-400 dark:text-slate-500">Nothing open</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SandboxCard>
        </div>
        <PaymentPipelineCard p={pipeline} href="/finance-ledger" />
      </div>
    </div>
  );
}
