import { NextRequest, NextResponse } from "next/server";
import { backfillScoutedHandleLower } from "@/lib/actions";

// One-time backfill route for the new handleLower unique constraint on
// ScoutedCreator (see schema.prisma + actions.ts comments). Run
// /api/cron/dedupe-scouted-creators once first if you haven't already —
// this route reports any remaining same-handle collisions in `conflicts`
// rather than resolving them itself. Safe to hit more than once; becomes a
// no-op once every row has handleLower set. Same secret gate as the other
// cron routes.
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
    const result = await backfillScoutedHandleLower();
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Backfill failed unexpectedly." }, { status: 500 });
  }
}
