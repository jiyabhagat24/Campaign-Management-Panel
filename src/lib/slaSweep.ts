// Task #18 — the automatic SLA notification sweep. Run daily from
// /api/cron/sla-notifications (same secret-gated pattern as the other
// /api/cron/* routes). Covers the spec's highest-value recurring triggers:
// 48h-dormant onboarded/blocked creators, go-live deadlines approaching or
// breached, Pricing Queue rows sitting too long, unclaimed Escalations, and
// the 7-day client-chase gate (Action Tracker). Each one is a DIGEST
// notification (see notify.ts) with a same-day dedupe check so re-running
// the sweep doesn't spam the same person the same finding twice in one day.
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

const DAY_MS = 24 * 60 * 60 * 1000;

async function alreadyNotifiedToday(userId: string, title: string) {
  const since = new Date(Date.now() - DAY_MS);
  const existing = await prisma.notification.findFirst({
    where: { userId, title, createdAt: { gte: since } },
  });
  return Boolean(existing);
}

async function notifyOnceToday(userId: string, title: string, body: string) {
  if (await alreadyNotifiedToday(userId, title)) return false;
  await notify({ userId, channel: "DIGEST", title, body });
  return true;
}

export async function runSlaNotificationSweep() {
  const counts = {
    dormant: 0,
    deadlineApproaching: 0,
    deadlineBreached: 0,
    pricingQueueStale: 0,
    escalationsUnclaimed: 0,
    staleChase: 0,
  };

  // ---- 1. Dormant creators: ONBOARDED/BLOCKED, no logged activity in 48h ----
  const activeCreators = await prisma.creator.findMany({
    where: { status: { in: ["ONBOARDED", "BLOCKED"] } },
    include: { campaign: { select: { id: true, name: true } }, poc: { select: { id: true, name: true } }, deliverables: { select: { id: true } } },
  });

  for (const creator of activeCreators) {
    const entityIds = [creator.id, ...creator.deliverables.map((d) => d.id)];
    const lastLog = await prisma.activityLog.findFirst({
      where: { campaignId: creator.campaignId, entityId: { in: entityIds } },
      orderBy: { createdAt: "desc" },
    });
    const lastActionAt = lastLog?.createdAt ?? creator.onboardedAt ?? creator.createdAt;
    const hoursSince = (Date.now() - lastActionAt.getTime()) / (60 * 60 * 1000);
    if (hoursSince < 48) continue;

    const recipientId = creator.pocUserId;
    if (!recipientId) continue;
    const sent = await notifyOnceToday(
      recipientId,
      `No action on ${creator.name} in 48h+`,
      `${creator.name} on ${creator.campaign.name} hasn't had any logged action in over 48 hours — check in.`
    );
    if (sent) counts.dormant++;

    // Deadline approaching/breached, same creator loop (avoids a second full scan).
    if (creator.goLiveDeadline) {
      const diffMs = creator.goLiveDeadline.getTime() - Date.now();
      if (diffMs < 0 && recipientId) {
        const sentB = await notifyOnceToday(
          recipientId,
          `Go-live deadline breached: ${creator.name}`,
          `${creator.name} on ${creator.campaign.name} is past its go-live deadline.`
        );
        if (sentB) counts.deadlineBreached++;
      } else if (diffMs >= 0 && diffMs < 3 * DAY_MS && recipientId) {
        const sentA = await notifyOnceToday(
          recipientId,
          `Go-live deadline approaching: ${creator.name}`,
          `${creator.name} on ${creator.campaign.name} is due to go live within 3 days.`
        );
        if (sentA) counts.deadlineApproaching++;
      }
    }
  }

  // ---- 2. Pricing Queue rows sitting 48h+ unpriced ----
  const stalePricing = await prisma.creator.findMany({
    where: {
      status: { notIn: ["REJECTED", "CLIENT_REJECTED"] },
      quotedCost: null,
      internalCost: { not: null },
      createdAt: { lt: new Date(Date.now() - 2 * DAY_MS) },
    },
    include: { campaign: { select: { id: true, name: true, teamMembers: { where: { roleOnCampaign: "CAMPAIGN_MANAGER" }, select: { userId: true } } } } },
  });
  for (const creator of stalePricing) {
    for (const tm of creator.campaign.teamMembers) {
      const sent = await notifyOnceToday(
        tm.userId,
        `Pricing Queue: ${creator.name} waiting 48h+`,
        `${creator.name} on ${creator.campaign.name} has been waiting on a vet/price decision for over 48 hours.`
      );
      if (sent) counts.pricingQueueStale++;
    }
  }

  // ---- 3. Escalations open 24h+ with no owner ----
  const staleEscalations = await prisma.escalation.findMany({
    where: { status: "OPEN", createdAt: { lt: new Date(Date.now() - DAY_MS) } },
    include: { campaign: { select: { name: true } } },
  });
  if (staleEscalations.length > 0) {
    const irManagers = await prisma.user.findMany({ where: { role: "IR_MANAGER" }, select: { id: true } });
    for (const esc of staleEscalations) {
      for (const mgr of irManagers) {
        const sent = await notifyOnceToday(
          mgr.id,
          `Escalation unclaimed 24h+: ${esc.title}`,
          `"${esc.title}" on ${esc.campaign.name} has been open for over 24 hours with no owner.`
        );
        if (sent) counts.escalationsUnclaimed++;
      }
    }
  }

  // ---- 4. Stale client chase (7-day gate, Action Tracker) ----
  // Inlined rather than calling actions.ts's getStaleChaseCandidates, which
  // requires a logged-in session (requireUser) — this sweep runs from a
  // cron route with no session at all.
  const preOnboardCreators = await prisma.creator.findMany({
    where: { status: { notIn: ["ONBOARDED", "REJECTED", "CLIENT_REJECTED"] } },
    include: {
      campaign: { select: { id: true, name: true } },
      chaseLogs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const staleChase = preOnboardCreators
    .map((c) => {
      const lastChaseAt = c.chaseLogs[0]?.createdAt ?? c.createdAt;
      return { creator: c, lastChaseAt };
    })
    .filter((row) => Date.now() - row.lastChaseAt.getTime() > 7 * DAY_MS);

  for (const { creator } of staleChase) {
    const campaignTeam = await prisma.campaignTeamMember.findMany({
      where: { campaignId: creator.campaignId, roleOnCampaign: "CAMPAIGN_MANAGER" },
      select: { userId: true },
    });
    for (const tm of campaignTeam) {
      const sent = await notifyOnceToday(
        tm.userId,
        `No client chase logged in 7+ days: ${creator.name}`,
        `${creator.name} on ${creator.campaign.name} hasn't had a chase attempt logged in over 7 days.`
      );
      if (sent) counts.staleChase++;
    }
  }

  return counts;
}
