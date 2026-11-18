import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageReportingLines, canViewTeamTurnaround, isSuperAdmin } from "@/lib/rbac";
import { ROLE_DISPLAY_NAMES, type Role } from "@/lib/constants";
import { effectiveDeadlineMs } from "@/lib/irDashboard";
import TeamTurnaroundClient, { type TeamPersonRow } from "@/components/team/TeamTurnaroundClient";

// Team & turnaround (sandbox audit, Phase 1). New page, nothing existing is
// changed. Answers "who reports to whom, and how loaded is each person?" for
// the CXO and the IR Manager. Definitions are deliberately single-sourced:
//  - Active campaign = Campaign.status ACTIVE (closed/cancelled/draft excluded)
//  - Creator record  = ONBOARDED creator in an ACTIVE campaign, owned by
//                      Creator.sourcedByUserId (same rule as the IRE dashboard)
//  - Delayed         = that creator's go-live deadline has passed with no
//                      live link on any deliverable yet
//  - Open escalation = Escalation.ownerId is the person and status != CLOSED

const MANAGED_ROLES = ["CAMPAIGN_MANAGER", "IR_MANAGER", "IR_EXECUTIVE", "IR_INTERN"];

export default async function TeamTurnaroundPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewTeamTurnaround(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");

  // managerId is a new column. Until `npx prisma db push` has been run the
  // query below fails, so fall back to "no reporting lines yet" and say so.
  let users: { id: string; name: string; email: string; role: string; managerId: string | null }[] = [];
  let reportingLinesReady = true;
  try {
    users = await (prisma as any).user.findMany({
      select: { id: true, name: true, email: true, role: true, managerId: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
  } catch {
    reportingLinesReady = false;
    const plain = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    users = plain.map((u) => ({ ...u, managerId: null }));
  }

  // Scope. CXO (and super admin) see everyone. An IR Manager sees themselves
  // plus everyone below them in the reporting tree; if no lines are set yet,
  // they see every CM and IR-role person, with a notice explaining why.
  const isLeadership = user.role === "CXO" || isSuperAdmin(user.id);
  let scopeIds: Set<string>;
  let usingFallbackScope = false;
  if (isLeadership) {
    scopeIds = new Set(users.map((u) => u.id));
  } else {
    const byManager = new Map<string, string[]>();
    for (const u of users) {
      if (!u.managerId) continue;
      byManager.set(u.managerId, [...(byManager.get(u.managerId) ?? []), u.id]);
    }
    scopeIds = new Set([user.id]);
    const queue = [user.id];
    while (queue.length) {
      const id = queue.shift() as string;
      for (const child of byManager.get(id) ?? []) {
        if (!scopeIds.has(child)) {
          scopeIds.add(child);
          queue.push(child);
        }
      }
    }
    if (scopeIds.size === 1) {
      usingFallbackScope = true;
      for (const u of users) if (MANAGED_ROLES.includes(u.role)) scopeIds.add(u.id);
    }
  }
  const scoped = users.filter((u) => scopeIds.has(u.id));
  const ids = scoped.map((u) => u.id);

  const [memberships, creators, escalations] = await Promise.all([
    prisma.campaignTeamMember.findMany({
      where: { userId: { in: ids }, campaign: { status: "ACTIVE" } },
      select: { userId: true, campaignId: true },
    }),
    (prisma as any).creator.findMany({
      where: { sourcedByUserId: { in: ids }, status: "ONBOARDED", campaign: { status: "ACTIVE" } },
      select: {
        sourcedByUserId: true,
        goLiveDeadline: true,
        onboardedAt: true,
        deliverables: { select: { liveLink: true } },
      },
    }) as Promise<{ sourcedByUserId: string | null; goLiveDeadline: Date | null; onboardedAt: Date | null; deliverables: { liveLink: string | null }[] }[]>,
    prisma.escalation.findMany({
      where: { ownerId: { in: ids }, status: { not: "CLOSED" } },
      select: { ownerId: true, severity: true },
    }),
  ]);

  const now = Date.now();
  const campaignsBy = new Map<string, Set<string>>();
  for (const m of memberships) {
    const set = campaignsBy.get(m.userId) ?? new Set<string>();
    set.add(m.campaignId);
    campaignsBy.set(m.userId, set);
  }
  const creatorsBy = new Map<string, { total: number; delayed: number }>();
  for (const cr of creators) {
    if (!cr.sourcedByUserId) continue;
    const agg = creatorsBy.get(cr.sourcedByUserId) ?? { total: 0, delayed: 0 };
    agg.total += 1;
    const deadline = effectiveDeadlineMs(cr);
    const live = cr.deliverables.some((d) => Boolean(d.liveLink));
    if (deadline !== null && deadline < now && !live) agg.delayed += 1;
    creatorsBy.set(cr.sourcedByUserId, agg);
  }
  const escalationsBy = new Map<string, { open: number; high: number }>();
  for (const e of escalations) {
    if (!e.ownerId) continue;
    const agg = escalationsBy.get(e.ownerId) ?? { open: 0, high: 0 };
    agg.open += 1;
    if ((e.severity ?? "").toUpperCase() === "HIGH") agg.high += 1;
    escalationsBy.set(e.ownerId, agg);
  }

  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const rows: TeamPersonRow[] = scoped
    .filter((u) => u.role !== "CLIENT")
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      roleLabel: ROLE_DISPLAY_NAMES[u.role as Role] ?? u.role,
      managerId: u.managerId,
      managerName: u.managerId ? nameById.get(u.managerId) ?? null : null,
      activeCampaigns: campaignsBy.get(u.id)?.size ?? 0,
      creatorRecords: creatorsBy.get(u.id)?.total ?? 0,
      delayedCreators: creatorsBy.get(u.id)?.delayed ?? 0,
      openEscalations: escalationsBy.get(u.id)?.open ?? 0,
      highEscalations: escalationsBy.get(u.id)?.high ?? 0,
    }));

  const managerOptions = users
    .filter((u) => u.role !== "CLIENT")
    .map((u) => ({ id: u.id, name: u.name, roleLabel: ROLE_DISPLAY_NAMES[u.role as Role] ?? u.role }));

  return (
    <TeamTurnaroundClient
      rows={rows}
      managerOptions={managerOptions}
      canEdit={reportingLinesReady && (canManageReportingLines(user.role) || isSuperAdmin(user.id))}
      reportingLinesReady={reportingLinesReady}
      usingFallbackScope={usingFallbackScope}
      viewerName={user.name}
      todayLabel={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}
    />
  );
}
