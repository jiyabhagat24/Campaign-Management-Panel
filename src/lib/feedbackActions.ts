"use server";

// Team feedback board actions. Internal team members only (any role);
// clients can neither post nor read.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClient } from "@/lib/rbac";

const db = prisma as any;

const FEEDBACK_CATEGORIES = ["GENERAL", "IDEA", "ISSUE"] as const;
const MAX_LENGTH = 2000;

async function requireInternal() {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function postFeedback(_prev: { error?: string; ok?: number } | undefined, fd: FormData) {
  const user = await requireInternal();
  const body = String(fd.get("body") ?? "").trim();
  const rawCategory = String(fd.get("category") ?? "GENERAL");
  const category = (FEEDBACK_CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : "GENERAL";
  if (!body) return { error: "Write something before posting." };
  if (body.length > MAX_LENGTH) return { error: `Keep it under ${MAX_LENGTH} characters.` };
  await db.teamFeedback.create({
    data: { body, category, authorId: user.id, authorName: user.name, authorRole: user.role },
  });
  revalidatePath("/feedback");
  return { ok: Date.now() };
}

export async function setFeedbackStatusForm(fd: FormData) {
  const user = await requireInternal();
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "") === "DONE" ? "DONE" : "OPEN";
  if (!id) return;
  await db.teamFeedback.update({
    where: { id },
    data: status === "DONE" ? { status, resolvedAt: new Date(), resolvedByName: user.name } : { status, resolvedAt: null, resolvedByName: null },
  });
  revalidatePath("/feedback");
}
