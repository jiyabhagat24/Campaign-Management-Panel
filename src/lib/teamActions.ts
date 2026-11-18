"use server";

// Reporting-line actions (sandbox audit, Phase 1). Kept in their own file so
// nothing in the existing actions.ts changes. Only the IR Manager sets who reports
// to whom (workflow spec: IRM owns team assignment). Super admin can too.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageReportingLines, isSuperAdmin } from "@/lib/rbac";

export async function setReportingManager(userId: string, managerId: string | null): Promise<{ error?: string }> {
  const actor = await requireUser();
  if (!canManageReportingLines(actor.role) && !isSuperAdmin(actor.id)) {
    return { error: "Only the IR Manager can change reporting lines." };
  }
  if (managerId && managerId === userId) return { error: "Someone can't report to themselves." };

  const db = prisma as any; // managerId is new; the local Prisma client may not be regenerated yet
  const person = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!person) return { error: "That team member no longer exists." };

  if (managerId) {
    const manager = await prisma.user.findUnique({ where: { id: managerId }, select: { id: true } });
    if (!manager) return { error: "That manager no longer exists." };

    // Refuse loops: walk up from the proposed manager; if we reach userId,
    // the change would make the person their own (indirect) manager.
    let cursor: string | null = managerId;
    for (let i = 0; cursor && i < 50; i++) {
      if (cursor === userId) return { error: "That would create a reporting loop." };
      const row: { managerId: string | null } | null = await db.user.findUnique({
        where: { id: cursor },
        select: { managerId: true },
      });
      cursor = row?.managerId ?? null;
    }
  }

  try {
    await db.user.update({ where: { id: userId }, data: { managerId } });
  } catch {
    return { error: "Couldn't save. The database may still need the reporting-line update (npx prisma db push)." };
  }

  revalidatePath("/team-turnaround");
  return {};
}
