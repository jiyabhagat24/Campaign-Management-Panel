import { prisma } from "@/lib/prisma";

// Per-deliverable version history (gap build). Every script link, review
// (video) link and live link saved on a deliverable is kept as a numbered
// version, so the attempt history survives later edits. Writes are best
// effort: before `npx prisma db push` creates the table this does nothing.

export type VersionKind = "SCRIPT" | "VIDEO" | "LIVE";

export async function recordDeliverableVersion(params: {
  deliverableId: string;
  kind: VersionKind;
  url: string | null | undefined;
  statusAtTime?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
}) {
  if (!params.url) return;
  try {
    const db = prisma as any;
    const last = await db.deliverableVersion.findFirst({
      where: { deliverableId: params.deliverableId, kind: params.kind },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true, url: true },
    });
    // Same link saved again (e.g. a status-only change) is not a new version.
    if (last && last.url === params.url) return;
    await db.deliverableVersion.create({
      data: {
        deliverableId: params.deliverableId,
        kind: params.kind,
        versionNo: (last?.versionNo ?? 0) + 1,
        url: params.url,
        statusAtTime: params.statusAtTime ?? null,
        actorUserId: params.actorUserId ?? null,
        actorName: params.actorName ?? null,
      },
    });
  } catch {
    // table not created yet
  }
}

export function versionLabel(kind: string, n: number) {
  return `${kind === "SCRIPT" ? "r" : kind === "VIDEO" ? "v" : "live "}${n}`;
}
