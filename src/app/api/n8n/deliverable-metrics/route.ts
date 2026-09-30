import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// Called by the n8n "refresh stats" workflow with fresh numbers for live
// deliverables. Body: { deliverables: [{ id, views, likes, comments, shares? }] }
// (or a single object of that shape). Auth: x-cron-secret header (or ?secret=)
// checked against CRON_SECRET, same as the /api/cron/* routes.
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "CRON_SECRET isn't set on the server yet." }, { status: 503 });
  }
  const provided = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  if (provided !== expectedSecret) {
    return NextResponse.json({ error: "Invalid or missing secret." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const items: any[] = Array.isArray(body?.deliverables) ? body.deliverables : body?.id ? [body] : [];
  if (items.length === 0) return NextResponse.json({ error: "No deliverables in body." }, { status: 400 });

  let updated = 0;
  const campaignIds = new Set<string>();
  for (const it of items) {
    const views = Number(it.views);
    const likes = Number(it.likes);
    const comments = Number(it.comments);
    if (!it.id || [views, likes, comments].some((n) => !Number.isFinite(n))) continue;
    const shares = it.shares == null || !Number.isFinite(Number(it.shares)) ? undefined : Number(it.shares);
    const engagementRate = views > 0 ? ((likes + comments + (shares ?? 0)) / views) * 100 : undefined;
    try {
      const d = await prisma.deliverable.update({
        where: { id: String(it.id) },
        data: { views, likes, comments, ...(shares !== undefined ? { shares } : {}), engagementRate, lastTrackedAt: new Date(), status: "TRACKING" },
        include: { creator: { select: { campaignId: true } } },
      });
      campaignIds.add(d.creator.campaignId);
      updated += 1;
    } catch {
      // unknown deliverable id — skip
    }
  }
  for (const id of campaignIds) {
    revalidatePath(`/campaigns/${id}`);
    revalidatePath(`/campaigns/${id}/report`);
  }
  return NextResponse.json({ ok: true, updated });
}
