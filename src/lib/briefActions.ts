"use server";

// Briefs & strategy actions (gap build). New file; nothing existing changes.
// Business Development (kept login) or Brand Solutions posts a brief. Brand
// Solutions picks it up, can ask clarifying questions, and links the campaign
// they create from it on the existing New Campaign form. CXO reads only.
// Every status change is written as a STATUS message (who, when, old, new: G14)
// and the next owner gets an in-app notification (no email from here).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canPostBrief, canWorkBrief, isSuperAdmin } from "@/lib/rbac";

type Result = { error?: string; id?: string };
const db = prisma as any;

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  CLARIFICATION: "Waiting on clarification",
  FULFILLED: "Fulfilled",
  ON_HOLD: "On hold",
  LOST: "Lost",
};

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[, ₹]/g, ""));
  return String(v ?? "").trim() && Number.isFinite(n) ? n : null;
};
const str = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim();
  return t ? t : null;
};
const date = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
};

async function notifyUsers(userIds: string[], title: string, body: string, briefId: string, actionRequired: string | null) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return;
  try {
    await db.notification.createMany({
      data: ids.map((userId) => ({ userId, channel: "INSTANT", title, body, entityType: "Brief", entityId: briefId, actionRequired })),
    });
  } catch {
    await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, channel: "INSTANT", title, body })) });
  }
}

async function logStatus(briefId: string, actor: { id: string; name: string }, from: string, to: string, note?: string | null) {
  await db.briefMessage.create({
    data: { briefId, authorId: actor.id, authorName: actor.name, kind: "STATUS", body: `${STATUS_LABEL[from] ?? from} → ${STATUS_LABEL[to] ?? to}${note ? ` · ${note}` : ""}` },
  });
}

async function loadBrief(id: string) {
  return (await db.brief.findUnique({ where: { id } })) as
    | { id: string; title: string; brand: string; status: string; createdById: string; ownerId: string | null; campaignId: string | null }
    | null;
}

export async function createBrief(input: {
  title: string; brand: string; objective?: string | null; category?: string | null; productUrl?: string | null;
  budget?: number | null; creatorQty?: number | null; deliverableQty?: number | null; platformPlan?: string | null;
  languages?: string | null; regions?: string | null; expectedCpv?: number | null; timelineStart?: Date | null;
  timelineEnd?: Date | null; notes?: string | null; assigneeId?: string | null;
}): Promise<Result> {
  const user = await requireUser();
  if (!canPostBrief(user.role) && !isSuperAdmin(user.id)) return { error: "Only Business Development or Brand Solutions can post a brief." };
  if (!input.title?.trim() || !input.brand?.trim()) return { error: "Title and brand are required." };
  if (input.productUrl && !/^https?:\/\//i.test(input.productUrl)) return { error: "Product link must start with http:// or https://" };
  for (const [k, v] of [["Budget", input.budget], ["Expected CPV", input.expectedCpv], ["Creators", input.creatorQty], ["Deliverables", input.deliverableQty]] as const) {
    if (v != null && v < 0) return { error: `${k} can't be negative.` };
  }
  if (input.timelineStart && input.timelineEnd && input.timelineEnd < input.timelineStart) return { error: "Timeline end is before its start." };

  // Business Development names the Brand Solutions person the brief is for.
  // The brief stays NEW (assigned, not started) until that person starts it.
  const { assigneeId, ...fields } = input;
  let assignee: { id: string; name: string } | null = null;
  if (user.role !== "BRAND_SOLUTIONS") {
    if (assigneeId) {
      assignee = await prisma.user.findFirst({ where: { id: assigneeId, role: "BRAND_SOLUTIONS" }, select: { id: true, name: true } });
      if (!assignee) return { error: "Pick a Brand Solutions person to give this brief to." };
    } else if (user.role === "BUSINESS_DEVELOPMENT") {
      return { error: "Pick the Brand Solutions person you're giving this brief to." };
    }
  }

  const brief = await db.brief.create({
    data: {
      ...fields,
      ...(assignee ? { ownerId: assignee.id, ownerName: assignee.name } : {}),
      title: input.title.trim(),
      brand: input.brand.trim(),
      createdById: user.id,
      createdByName: user.name,
      // A brief Brand Solutions posts for themselves is already theirs.
      ...(user.role === "BRAND_SOLUTIONS" ? { ownerId: user.id, ownerName: user.name, status: "IN_PROGRESS", startedAt: new Date() } : {}),
    },
  });
  await logStatus(brief.id, user, "-", brief.status, assignee ? `assigned to ${assignee.name}` : null);
  if (assignee) {
    await notifyUsers([assignee.id], `Brief assigned to you: ${brief.brand}`, `${user.name} gave you "${brief.title}". Open it in Briefs & strategy to start or ask a question.`, brief.id, "Review brief");
  } else if (user.role !== "BRAND_SOLUTIONS") {
    const bs = await prisma.user.findMany({ where: { role: "BRAND_SOLUTIONS" }, select: { id: true } });
    await notifyUsers(bs.map((u) => u.id), `New brief: ${brief.brand}`, `${user.name} posted "${brief.title}". Pick it up in Briefs & strategy.`, brief.id, "Review brief");
  }
  revalidatePath("/briefs");
  return { id: brief.id };
}

export async function startBrief(briefId: string): Promise<Result> {
  const user = await requireUser();
  if (!canWorkBrief(user.role) && !isSuperAdmin(user.id)) return { error: "Only Brand Solutions works briefs." };
  const b = await loadBrief(briefId);
  if (!b) return { error: "Brief not found." };
  if (b.ownerId && b.ownerId !== user.id) return { error: "Another Brand Solutions user is already working this brief." };
  if (b.status !== "NEW" && b.status !== "ON_HOLD") return { error: `Can't start a brief that is ${STATUS_LABEL[b.status]?.toLowerCase()}.` };
  await db.brief.update({ where: { id: briefId }, data: { status: "IN_PROGRESS", ownerId: user.id, ownerName: user.name, startedAt: new Date() } });
  await logStatus(briefId, user, b.status, "IN_PROGRESS");
  await notifyUsers([b.createdById], `Brief picked up: ${b.brand}`, `${user.name} started working on "${b.title}".`, briefId, null);
  revalidatePath("/briefs");
  revalidatePath(`/briefs/${briefId}`);
  return {};
}

// Brand Solutions asks a question (status -> waiting on clarification);
// the brief's author answers (status -> back in progress). Either side can
// also leave a plain note.
export async function postBriefMessage(briefId: string, body: string, kind: "QUESTION" | "ANSWER" | "NOTE"): Promise<Result> {
  const user = await requireUser();
  const text = body.trim();
  if (!text) return { error: "Write a message first." };
  const b = await loadBrief(briefId);
  if (!b) return { error: "Brief not found." };
  const isOwner = b.ownerId === user.id;
  const isAuthor = b.createdById === user.id;
  if (!isOwner && !isAuthor && !isSuperAdmin(user.id)) return { error: "Only the brief's author or the Brand Solutions owner can write here." };
  if (kind === "QUESTION" && !isOwner) return { error: "Only the Brand Solutions owner asks clarification questions." };
  if (kind === "ANSWER" && !isAuthor) return { error: "Only the brief's author answers clarification questions." };
  if (b.status === "FULFILLED" || b.status === "LOST") return { error: "This brief is closed." };

  await db.briefMessage.create({ data: { briefId, authorId: user.id, authorName: user.name, kind, body: text } });
  if (kind === "QUESTION" && b.status !== "CLARIFICATION") {
    await db.brief.update({ where: { id: briefId }, data: { status: "CLARIFICATION" } });
    await logStatus(briefId, user, b.status, "CLARIFICATION");
  }
  if (kind === "ANSWER" && b.status === "CLARIFICATION") {
    // An assignee who asked before pressing Start goes back to New, not In progress.
    const nextStatus = (b as any).startedAt ? "IN_PROGRESS" : "NEW";
    await db.brief.update({ where: { id: briefId }, data: { status: nextStatus } });
    await logStatus(briefId, user, b.status, nextStatus);
  }
  const other = isOwner ? b.createdById : b.ownerId;
  if (other && other !== user.id) {
    await notifyUsers(
      [other],
      kind === "QUESTION" ? `Clarification needed: ${b.brand}` : kind === "ANSWER" ? `Clarification answered: ${b.brand}` : `Note on brief: ${b.brand}`,
      `${user.name}: ${text.slice(0, 180)}`,
      briefId,
      kind === "QUESTION" ? "Answer clarification" : null
    );
  }
  revalidatePath(`/briefs/${briefId}`);
  revalidatePath("/briefs");
  return {};
}

// Link the campaign Brand Solutions created from this brief. Marks the brief
// fulfilled and tells the author and the IR Managers (spec: brief published
// notifies the IR Manager, who assigns the team).
export async function linkBriefCampaign(briefId: string, campaignId: string): Promise<Result> {
  const user = await requireUser();
  if (!canWorkBrief(user.role) && !isSuperAdmin(user.id)) return { error: "Only Brand Solutions links a campaign." };
  const b = await loadBrief(briefId);
  if (!b) return { error: "Brief not found." };
  if (b.ownerId !== user.id && !isSuperAdmin(user.id)) return { error: "Start working on the brief before linking a campaign." };
  if (b.status === "LOST") return { error: "This brief is marked lost." };
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, ...campaignVisibilityWhere(user) }, select: { id: true, name: true } });
  if (!campaign) return { error: "You can only link a campaign you're assigned to." };
  await db.brief.update({ where: { id: briefId }, data: { campaignId, status: "FULFILLED", fulfilledAt: new Date() } });
  await logStatus(briefId, user, b.status, "FULFILLED", `campaign ${campaign.name}`);
  const irm = await prisma.user.findMany({ where: { role: "IR_MANAGER" }, select: { id: true } });
  await notifyUsers([b.createdById], `Brief fulfilled: ${b.brand}`, `Campaign "${campaign.name}" was created from "${b.title}".`, briefId, null);
  await notifyUsers(irm.map((u) => u.id), `Brief published: ${b.brand}`, `Campaign "${campaign.name}" needs a team assigned.`, briefId, "Assign team");
  revalidatePath("/briefs");
  revalidatePath(`/briefs/${briefId}`);
  return {};
}

export async function setBriefOutcome(briefId: string, outcome: "ON_HOLD" | "LOST" | "IN_PROGRESS", note: string): Promise<Result> {
  const user = await requireUser();
  if (!canWorkBrief(user.role) && !isSuperAdmin(user.id)) return { error: "Only Brand Solutions sets a brief's outcome." };
  const b = await loadBrief(briefId);
  if (!b) return { error: "Brief not found." };
  if (b.ownerId !== user.id && !isSuperAdmin(user.id)) return { error: "Only the brief's owner can change its outcome." };
  if (b.status === "FULFILLED") return { error: "A fulfilled brief can't change outcome." };
  if (outcome !== "IN_PROGRESS" && !note.trim()) return { error: "Give a reason." };
  if (b.status === outcome) return {};
  await db.brief.update({ where: { id: briefId }, data: { status: outcome, outcomeNote: note.trim() || null } });
  await logStatus(briefId, user, b.status, outcome, note.trim() || null);
  await notifyUsers([b.createdById], `Brief ${STATUS_LABEL[outcome].toLowerCase()}: ${b.brand}`, note.trim() || `"${b.title}" is back in progress.`, briefId, null);
  revalidatePath("/briefs");
  revalidatePath(`/briefs/${briefId}`);
  return {};
}

// ---------- form wrappers (pages post plain forms; errors come back as ?error=) ----------

function back(path: string, r: Result) {
  redirect(r.error ? `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(r.error)}` : path);
}

export async function createBriefForm(fd: FormData) {
  const r = await createBrief({
    title: String(fd.get("title") ?? ""),
    brand: String(fd.get("brand") ?? ""),
    objective: str(fd.get("objective")),
    category: str(fd.get("category")),
    productUrl: str(fd.get("productUrl")),
    budget: num(fd.get("budget")),
    creatorQty: num(fd.get("creatorQty")),
    deliverableQty: num(fd.get("deliverableQty")),
    platformPlan: str(fd.get("platformPlan")),
    languages: str(fd.get("languages")),
    regions: str(fd.get("regions")),
    expectedCpv: num(fd.get("expectedCpv")),
    timelineStart: date(fd.get("timelineStart")),
    timelineEnd: date(fd.get("timelineEnd")),
    notes: str(fd.get("notes")),
    assigneeId: str(fd.get("assigneeId")),
  });
  back(r.id ? `/briefs/${r.id}` : "/briefs", r);
}
export async function startBriefForm(fd: FormData) {
  const id = String(fd.get("briefId"));
  back(`/briefs/${id}`, await startBrief(id));
}
export async function postBriefMessageForm(fd: FormData) {
  const id = String(fd.get("briefId"));
  back(`/briefs/${id}`, await postBriefMessage(id, String(fd.get("body") ?? ""), String(fd.get("kind")) as "QUESTION" | "ANSWER" | "NOTE"));
}
export async function linkBriefCampaignForm(fd: FormData) {
  const id = String(fd.get("briefId"));
  back(`/briefs/${id}`, await linkBriefCampaign(id, String(fd.get("campaignId") ?? "")));
}
export async function setBriefOutcomeForm(fd: FormData) {
  const id = String(fd.get("briefId"));
  back(`/briefs/${id}`, await setBriefOutcome(id, String(fd.get("outcome")) as "ON_HOLD" | "LOST" | "IN_PROGRESS", String(fd.get("note") ?? "")));
}
