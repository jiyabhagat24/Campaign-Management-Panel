import { prisma } from "@/lib/prisma";

export async function logActivity(params: {
  campaignId: string;
  actorId: string;
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
      actorName: params.actorName,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      meta: params.meta ? JSON.stringify(params.meta) : null,
    },
  });
}
