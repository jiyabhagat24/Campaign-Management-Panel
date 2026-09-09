import { NextRequest, NextResponse } from "next/server";
import { refreshAllCreatorsSocialStats } from "@/lib/actions";

// Dedicated daily sweep: pulls fresh Subscribers/Median Views/Median ER%
// for every shortlisted/onboarded creator with a YouTube channel (and
// Instagram numbers from whatever's already in InstagramProfileCache),
// writing back only fields that actually changed. Split out from
// /api/cron/sync-instagram-sheet so this keeps refreshing YouTube numbers
// even if the Google Sheet sync is unconfigured or failing — the two jobs
// don't depend on each other.
//
// Auth: ?secret=... query param (or x-cron-secret header) checked against
// CRON_SECRET in .env — same pattern as the other /api/cron/* routes.
// Point any scheduler at this URL once a day (or more often once a
// campaign's live): Vercel Cron, n8n's Schedule Trigger + HTTP Request,
// cron-job.org, etc.
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
    const result = await refreshAllCreatorsSocialStats();
    return NextResponse.json({ ...result, refreshedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Creator stats refresh failed unexpectedly." },
      { status: 500 }
    );
  }
}
