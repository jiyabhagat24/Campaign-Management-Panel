import { NextRequest, NextResponse } from "next/server";
import { fetchInstagramRowsFromSheet, GoogleSheetsSyncError } from "@/lib/googleSheets";
import { upsertInstagramProfiles } from "@/lib/instagramCache";
import { refreshAllCreatorsSocialStats } from "@/lib/actions";

// Pulls every row out of the Google Sheet your extension writes to and
// upserts them into InstagramProfileCache — this is the "update metrics
// every day" job. Not a page anyone visits; something a scheduler calls.
//
// After the sheet sync, this also sweeps every already-shortlisted/onboarded
// creator and pulls their stored Followers/Avg Views/Engagement% (and
// YouTube numbers) back in line with whatever's freshest in the cache — so a
// creator you added last week doesn't silently go stale forever. Same job,
// no separate schedule needed.
//
// Auth: ?secret=... query param (or x-cron-secret header) checked against
// CRON_SECRET in .env. Query param exists because most cron services
// (Vercel Cron, cron-job.org, Windows Task Scheduler hitting a URL) find a
// query param easier to configure than a custom header — either works.
//
// Scheduling options are documented in SETUP_GOOGLE_SHEETS_SYNC.md: Vercel
// Cron if deployed there, Windows Task Scheduler if self-hosted, or a free
// external pinger like cron-job.org.
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
    const rows = await fetchInstagramRowsFromSheet();
    const results = await upsertInstagramProfiles(rows);
    const failed = results.filter((r) => !r.ok);

    let refresh: Awaited<ReturnType<typeof refreshAllCreatorsSocialStats>> | { error: string } | null = null;
    try {
      refresh = await refreshAllCreatorsSocialStats();
    } catch (err) {
      refresh = { error: err instanceof Error ? err.message : "Creator refresh sweep failed unexpectedly." };
    }

    return NextResponse.json({
      ok: true,
      totalRows: rows.length,
      synced: results.length - failed.length,
      failed: failed.length,
      failedDetails: failed.length > 0 ? failed : undefined,
      creatorRefresh: refresh,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof GoogleSheetsSyncError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 502 });
    }
    return NextResponse.json({ error: "Sync failed unexpectedly." }, { status: 500 });
  }
}
