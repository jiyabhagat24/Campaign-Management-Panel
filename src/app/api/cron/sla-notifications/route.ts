import { NextRequest, NextResponse } from "next/server";
import { runSlaNotificationSweep } from "@/lib/slaSweep";

// Task #18 — daily SLA/notification sweep: 48h-dormant creators, go-live
// deadlines approaching/breached, Pricing Queue rows stuck 48h+, unclaimed
// Escalations 24h+, and the 7-day client-chase gate. Same secret-gated
// pattern as /api/cron/refresh-creator-stats — point a scheduler at this
// URL once a day (Vercel Cron, n8n, cron-job.org, etc.).
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
    const counts = await runSlaNotificationSweep();
    return NextResponse.json({ ...counts, ranAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SLA notification sweep failed unexpectedly." },
      { status: 500 }
    );
  }
}
