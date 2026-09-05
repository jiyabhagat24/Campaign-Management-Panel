import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { discoverYoutubeCreatorsForActiveCampaigns } from "@/lib/youtubeDiscovery";

// Automatic YouTube creator discovery — for every active campaign, searches
// YouTube for channels matching the brief and adds new ones to the scouting
// queue (ScoutedCreator, source "AUTO_DISCOVERY_YOUTUBE"). Not a page
// anyone visits; something a scheduler calls, same shape as
// /api/cron/sync-instagram-sheet.
//
// Auth: ?secret=... query param (or x-cron-secret header) checked against
// CRON_SECRET in .env — same gate as the Instagram sheet sync.
//
// Scheduling: point Vercel Cron, Windows Task Scheduler, or a free external
// pinger (cron-job.org) at this URL. YouTube's search endpoint costs 100
// quota units per call against the default 10,000/day free quota, so once a
// day per active campaign is a safe cadence — don't schedule this hourly.
export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET isn't set on the server yet — add it to .env and restart." },
      { status: 503 }
    );
  }

  const provided = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  if (provided !== expectedSecret) {
    return NextResponse.json({ error: "Invalid or missing secret." }, { status: 401 });
  }

  try {
    const summary = await discoverYoutubeCreatorsForActiveCampaigns();
    if (summary.added > 0) revalidatePath("/creators");
    return NextResponse.json({ ok: true, ...summary, ranAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Discovery run failed unexpectedly." }, { status: 500 });
  }
}
