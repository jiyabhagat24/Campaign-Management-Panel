import { NextRequest, NextResponse } from "next/server";
import { refreshLiveYoutubeDeliverableMetrics } from "@/lib/actions";

// Daily sweep: pulls fresh views/likes/comments for every live YouTube
// deliverable (Long form + Shorts) from the official YouTube Data API, so
// the Campaign Report's numbers move day to day instead of sitting frozen
// at whatever was last typed into refreshDeliverableMetrics by hand.
// Instagram deliverables aren't touched here — no free official API for
// another account's post metrics, see src/lib/tracking.ts.
//
// Auth: ?secret=... query param (or x-cron-secret header) checked against
// CRON_SECRET in .env — same pattern as the other /api/cron/* routes. Point
// any scheduler at this URL once a day: Vercel Cron, n8n's Schedule
// Trigger + HTTP Request, cron-job.org, etc.
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
    const result = await refreshLiveYoutubeDeliverableMetrics();
    return NextResponse.json({ ...result, refreshedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "YouTube metrics refresh failed unexpectedly." },
      { status: 500 }
    );
  }
}
