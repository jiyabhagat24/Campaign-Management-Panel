import { NextRequest, NextResponse } from "next/server";
import { dedupeScoutedCreators } from "@/lib/actions";

// One-time cleanup route for the duplicate ScoutedCreator rows that got in
// before addScoutedCreator had a duplicate check. Safe to hit more than
// once — it's a no-op once there's nothing left to dedupe. Not meant to be
// scheduled; just visit it once after upgrading, same secret gate as the
// other cron routes.
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
    const result = await dedupeScoutedCreators();
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Dedupe failed unexpectedly." }, { status: 500 });
  }
}
