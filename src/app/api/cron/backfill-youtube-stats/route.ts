import { NextRequest, NextResponse } from "next/server";
import { backfillYoutubeCreatorStats } from "@/lib/actions";

// One-time backfill route for YouTube ScoutedCreator rows that were scouted
// before avgViews/engagementRate got calculated — see the comment on
// backfillYoutubeCreatorStats in actions.ts. Safe to hit more than once;
// becomes a no-op once every YouTube row already has both numbers filled
// in. Same secret gate as the other cron routes.
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
    const result = await backfillYoutubeCreatorStats();
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Backfill failed unexpectedly." }, { status: 500 });
  }
}
