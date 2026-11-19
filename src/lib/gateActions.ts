"use server";

// Campaign gate actions (gap build). New file; nothing existing changes.
//   Release for shoot / publishing: the Campaign Manager assigned to the
//   campaign, after the script / video is approved.
//   Close execution: that Campaign Manager, once the closure checks pass.
//   Financial sign-off: Finance (kept login), once the checks pass.
//   When both sign-offs exist and the checks still pass, the campaign moves
//   Active -> Closed (spec State Machine) and everyone assigned, the client
//   and the CXO are told. Every step is written to the activity log (G14).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { canFinanceSignOff, canReleaseDeliverables, isSuperAdmin } from "@/lib/rbac";
import { allPass, canReleaseFor, closureChecks } from "@/lib/gates";

type Result = { error?: string };
const db = prisma as any;

async function isCampaignCm(userId: string, campaignId: string) {
  const row = await prisma.campaignTeamMember.findFirst({ where: { campaignId, userId, roleOnCampaign: "CAMPAIGN_MANAGER" }, select: { id: true } });
  return Boolean(row);
}

async function notifyUsers(userIds: string[], title: string, body: string, entityType: string, entityId: string, actionRequired: string | null) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return;
  await db.notification.createMany({ data: ids.map((userId) => ({ userId, channel: "INSTANT", title, body, entityType, entityId, actionRequired })) });
}

async function loadForClosure(campaignId: string) {
  return (await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true, name: true, brand: true, status: true, reportPublished: true,
      creators: { select: { status: true, deliverables: { select: { id: true, scriptStatus: true, contentStatus: true, liveLink: true, lastTrackedAt: true } } } },
      closure: true,
      teamMembers: { select: { userId: true } },
      clientAccess: { select: { clientId: true } },
    },
  })) as any;
}

export async function releaseDeliverable(deliverableId: string, kind: "SHOOT" | "PUBLISH", note?: string | null): Promise<Result> {
  const user = await requireUser();
  if (!canReleaseDeliverables(user.role) && !isSuperAdmin(user.id)) return { error: "Only the Campaign Manager releases deliverables." };
  if (kind !== "SHOOT" && kind !== "PUBLISH") return { error: "Unknown gate." };
  const d = (await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: {
      id: true, platform: true, scriptStatus: true, contentStatus: true, liveLink: true, lastTrackedAt: true,
      releases: { select: { kind: true } },
      creator: { select: { id: true, name: true, status: true, campaignId: true, pocUserId: true } },
    },
  })) as any;
  if (!d) return { error: "Deliverable not found." };
  if (!isSuperAdmin(user.id) && !(await isCampaignCm(user.id, d.creator.campaignId))) return { error: "You're not the Campaign Manager on this campaign." };
  if (d.creator.status !== "ONBOARDED") return { error: "Only onboarded creators can be released." };
  const check = canReleaseFor(kind, d);
  if (!check.ok) return { error: check.reason };

  await db.deliverableRelease.create({ data: { deliverableId, kind, releasedById: user.id, releasedByName: user.name, note: note?.trim() || null } });
  await logActivity({
    campaignId: d.creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: kind === "SHOOT" ? "RELEASED_FOR_SHOOT" : "RELEASED_FOR_PUBLISHING",
    entityType: "Deliverable",
    entityId: deliverableId,
    meta: { creator: d.creator.name, note: note?.trim() || undefined },
  });
  if (d.creator.pocUserId) {
    await notifyUsers(
      [d.creator.pocUserId],
      kind === "SHOOT" ? `Released for shoot · ${d.creator.name}` : `Released for publishing · ${d.creator.name}`,
      kind === "SHOOT" ? "Script approved and released. The creator can shoot." : "Video approved and released. The creator can publish; add the live link once it's up.",
      "Deliverable",
      deliverableId,
      kind === "SHOOT" ? "Brief creator to shoot" : "Add live link"
    );
  }
  revalidatePath(`/campaign-gates/${d.creator.campaignId}`);
  revalidatePath("/my-actions");
  return {};
}

async function maybeClose(campaignId: string, actor: { id: string; name: string }) {
  const c = await loadForClosure(campaignId);
  if (!c?.closure?.executionClosedAt || !c.closure.financeSignedOffAt || c.status === "CLOSED") return;
  if (!allPass(closureChecks(c))) return;
  const from = c.status;
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "CLOSED" } });
  await db.campaignClosure.update({ where: { campaignId }, data: { closedAt: new Date() } });
  await logActivity({ campaignId, actorId: actor.id, actorName: actor.name, action: "CAMPAIGN_CLOSED", entityType: "Campaign", entityId: campaignId, meta: { from, to: "CLOSED", via: "closure gates" } });
  const cxo = await prisma.user.findMany({ where: { role: { in: ["CXO", "AI"] } }, select: { id: true } });
  await notifyUsers([...c.teamMembers.map((t: any) => t.userId), ...cxo.map((u) => u.id)], `Campaign closed · ${c.brand}`, `${c.name} passed every closure check and is now closed.`, "Campaign", campaignId, null);
  for (const a of c.clientAccess) {
    await db.notification.create({ data: { clientId: a.clientId, channel: "INSTANT", title: `Campaign closed · ${c.name}`, body: "All deliverables are live and the final report is published.", entityType: "Campaign", entityId: campaignId } });
  }
}

export async function closeExecution(campaignId: string): Promise<Result> {
  const user = await requireUser();
  if (!canReleaseDeliverables(user.role) && !isSuperAdmin(user.id)) return { error: "Only the Campaign Manager closes execution." };
  if (!isSuperAdmin(user.id) && !(await isCampaignCm(user.id, campaignId))) return { error: "You're not the Campaign Manager on this campaign." };
  const c = await loadForClosure(campaignId);
  if (!c) return { error: "Campaign not found." };
  if (c.closure?.executionClosedAt) return { error: "Execution is already closed." };
  const checks = closureChecks(c);
  if (!allPass(checks)) return { error: `Not ready: ${checks.filter((x) => !x.ok).map((x) => x.label.toLowerCase()).join(", ")}.` };
  await db.campaignClosure.upsert({
    where: { campaignId },
    create: { campaignId, executionClosedAt: new Date(), executionClosedById: user.id, executionClosedByName: user.name },
    update: { executionClosedAt: new Date(), executionClosedById: user.id, executionClosedByName: user.name },
  });
  await logActivity({ campaignId, actorId: user.id, actorName: user.name, action: "EXECUTION_CLOSED", entityType: "Campaign", entityId: campaignId });
  const fin = await prisma.user.findMany({ where: { role: "FINANCE" }, select: { id: true } });
  await notifyUsers(fin.map((u) => u.id), `Sign off campaign · ${c.brand}`, `${user.name} closed execution on ${c.name}. It needs your financial sign-off to close.`, "Campaign", campaignId, "Financial sign-off");
  await maybeClose(campaignId, user);
  revalidatePath(`/campaign-gates/${campaignId}`);
  revalidatePath("/campaign-gates");
  return {};
}

export async function financeSignOff(campaignId: string): Promise<Result> {
  const user = await requireUser();
  if (!canFinanceSignOff(user.role) && !isSuperAdmin(user.id)) return { error: "Only Finance gives the financial sign-off." };
  const c = await loadForClosure(campaignId);
  if (!c) return { error: "Campaign not found." };
  if (!c.closure?.executionClosedAt) return { error: "The Campaign Manager has to close execution first." };
  if (c.closure.financeSignedOffAt) return { error: "Already signed off." };
  const checks = closureChecks(c);
  if (!allPass(checks)) return { error: `Closure checks no longer pass: ${checks.filter((x) => !x.ok).map((x) => x.label.toLowerCase()).join(", ")}.` };
  await db.campaignClosure.update({ where: { campaignId }, data: { financeSignedOffAt: new Date(), financeSignedOffById: user.id, financeSignedOffByName: user.name } });
  await logActivity({ campaignId, actorId: user.id, actorName: user.name, action: "FINANCE_SIGNED_OFF", entityType: "Campaign", entityId: campaignId });
  await maybeClose(campaignId, user);
  revalidatePath(`/campaign-gates/${campaignId}`);
  revalidatePath("/campaign-gates");
  return {};
}

// ---------- form wrappers ----------
function back(path: string, r: Result) {
  redirect(r.error ? `${path}?error=${encodeURIComponent(r.error)}` : path);
}
export async function releaseDeliverableForm(fd: FormData) {
  const r = await releaseDeliverable(String(fd.get("deliverableId")), String(fd.get("kind")) as "SHOOT" | "PUBLISH", String(fd.get("note") ?? ""));
  const b = String(fd.get("back") || "");
  back(b.startsWith("/") && !b.startsWith("//") ? b : "/campaign-gates", r);
}
export async function closeExecutionForm(fd: FormData) {
  const id = String(fd.get("campaignId"));
  back(`/campaign-gates/${id}`, await closeExecution(id));
}
export async function financeSignOffForm(fd: FormData) {
  const id = String(fd.get("campaignId"));
  back(`/campaign-gates/${id}`, await financeSignOff(id));
}
