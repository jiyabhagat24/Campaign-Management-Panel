import { prisma } from "@/lib/prisma";
import { PLATFORM_LABELS, type Platform } from "@/lib/constants";

// View history for the Campaign Report's Viewership Growth Graph. Every
// metrics refresh saves one DeliverableViewSnapshot; the Deliverable row
// itself still only holds the latest numbers. Accessed via (prisma as any)
// so the panel keeps working before `npx prisma db push` has created the
// table: saving a snapshot then quietly does nothing, and the graph says
// the table isn't there yet.

export type SnapshotSource = "YOUTUBE_API" | "N8N" | "MANUAL";

export async function recordViewSnapshot(
  deliverableId: string,
  stats: { views: number; likes?: number; comments?: number; shares?: number | null },
  source: SnapshotSource
) {
  try {
    await (prisma as any).deliverableViewSnapshot.create({
      data: {
        deliverableId,
        views: Math.max(0, Math.round(stats.views)),
        likes: Math.max(0, Math.round(stats.likes ?? 0)),
        comments: Math.max(0, Math.round(stats.comments ?? 0)),
        shares: stats.shares == null ? null : Math.max(0, Math.round(stats.shares)),
        source,
      },
    });
  } catch {
    // Table not created yet (db push pending) — never block the refresh itself.
  }
}

export type ViewGrowthPoint = { day: string } & Record<string, number | string>;
export type ViewGrowthResult =
  | { ready: false }
  | { ready: true; formats: { key: string; label: string }[]; points: ViewGrowthPoint[]; snapshotCount: number };

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

// Builds one point per day from the first snapshot to today. For each format
// (Long form, Shorts, Reels... never merged) the value is the sum, across
// that format's live deliverables, of each deliverable's latest known view
// count as of the end of that day (carried forward between refreshes).
export function buildViewGrowth(
  snapshots: { deliverableId: string; platform: string; views: number; capturedAt: Date }[],
  today: Date = new Date()
): { formats: { key: string; label: string }[]; points: ViewGrowthPoint[] } {
  if (snapshots.length === 0) return { formats: [], points: [] };
  const sorted = [...snapshots].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const formatKeys = Array.from(new Set(sorted.map((s) => s.platform)));
  const latest = new Map<string, { platform: string; views: number }>();
  const points: ViewGrowthPoint[] = [];

  const start = new Date(dayKey(sorted[0].capturedAt) + "T00:00:00.000Z");
  const end = new Date(dayKey(today) + "T00:00:00.000Z");
  let i = 0;
  for (let d = start; d.getTime() <= end.getTime(); d = new Date(d.getTime() + 86400000)) {
    const key = dayKey(d);
    while (i < sorted.length && dayKey(sorted[i].capturedAt) <= key) {
      latest.set(sorted[i].deliverableId, { platform: sorted[i].platform, views: sorted[i].views });
      i++;
    }
    const point: ViewGrowthPoint = { day: key };
    for (const f of formatKeys) point[f] = 0;
    for (const v of latest.values()) point[v.platform] = (point[v.platform] as number) + v.views;
    points.push(point);
  }

  return {
    formats: formatKeys.map((k) => ({ key: k, label: PLATFORM_LABELS[k as Platform] ?? k })),
    points,
  };
}

export async function loadCampaignViewGrowth(campaignId: string): Promise<ViewGrowthResult> {
  try {
    const rows: { deliverableId: string; views: number; capturedAt: Date; deliverable: { platform: string } }[] =
      await (prisma as any).deliverableViewSnapshot.findMany({
        where: { deliverable: { creator: { campaignId, status: "ONBOARDED" }, liveLink: { not: null } } },
        select: { deliverableId: true, views: true, capturedAt: true, deliverable: { select: { platform: true } } },
        orderBy: { capturedAt: "asc" },
      });
    const built = buildViewGrowth(
      rows.map((r) => ({ deliverableId: r.deliverableId, platform: r.deliverable.platform, views: r.views, capturedAt: new Date(r.capturedAt) }))
    );
    return { ready: true, ...built, snapshotCount: rows.length };
  } catch {
    return { ready: false };
  }
}
