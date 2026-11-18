"use server";

// Activity & notifications page actions (gap build). A user can only touch
// their own notifications (internal users by userId, clients by clientId).

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClient } from "@/lib/rbac";

const db = prisma as any;

function ownerWhere(user: { id: string; role: any }) {
  return isClient(user.role) ? { clientId: user.id } : { userId: user.id };
}

export async function acknowledgeNotification(id: string) {
  const user = await requireUser();
  const n = await db.notification.findFirst({ where: { id, ...ownerWhere(user) }, select: { id: true } });
  if (!n) return { error: "Notification not found." };
  await db.notification.update({ where: { id }, data: { read: true, acknowledgedAt: new Date() } });
  revalidatePath("/activity");
  revalidatePath("/my-actions");
  return {};
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { ...ownerWhere(user), read: false }, data: { read: true } });
  revalidatePath("/activity");
  return {};
}

export async function acknowledgeNotificationForm(fd: FormData) {
  await acknowledgeNotification(String(fd.get("id")));
}
export async function markAllNotificationsReadForm() {
  await markAllNotificationsRead();
}
