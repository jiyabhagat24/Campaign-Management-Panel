import { prisma } from "@/lib/prisma";

export async function logActivity(params: {
  campaignId: string;
  // Exactly one of actorId (internal User) / actorClientId (Client) should
  // be set — see the actorFields() helper in actions.ts, which builds
  // whichever one applies from the current session user.
  actorId?: string;
  actorClientId?: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  meta?: Record<string, unknown>;
}) {
  await prisma.activityLog.create({
    data: {
      campaignId: params.campaignId,
      actorId: params.actorId,
      actorClientId: params.actorClientId,
      actorName: params.actorName,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      meta: params.meta ? JSON.stringify(params.meta) : null,
    },
  });
}
