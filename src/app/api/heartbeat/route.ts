import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";

// Backs AutoRefresh (src/components/AutoRefresh.tsx). Every open tab polls
// this every few seconds and only re-renders its page (router.refresh())
// when the value returned here changes.
//
// The value is a "something was written" fingerprint made of two parts:
//
//  1. Postgres' own running count of inserted/updated/deleted rows across
//     the app's tables (pg_stat_user_tables, public schema). This moves on
//     EVERY write — including the many server actions that don't call
//     logActivity (briefs, payments, team changes, notifications, invoices)
//     — which is why some edits used to never show up on other screens
//     until a manual reload. Reading it is a catalog lookup, not a table
//     scan. Postgres publishes these counters within a few seconds of a
//     commit, not instantly, which the second part covers.
//  2. The newest ActivityLog timestamp (indexed), which moves the moment
//     any logged action commits.
//
// Role safety: the response is a bare fingerprint string with no row data,
// ids, or names, so it reveals nothing about what changed or where. The
// actual refresh re-renders the page on the server under the viewer's own
// session, so every query still goes through the normal role/visibility
// rules (campaignVisibilityWhere, serializeCreatorsForClient, etc.).
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [writes, latest] = await Promise.all([
    prisma
      .$queryRaw<{ writes: string | null }[]>`
        SELECT COALESCE(SUM(n_tup_ins + n_tup_upd + n_tup_del), 0)::text AS writes
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'`
      .then((rows) => rows[0]?.writes ?? "0")
      // If the stats view is ever unavailable, fall back to the activity
      // timestamp alone (the previous behaviour) rather than failing.
      .catch(() => "na"),
    prisma.activityLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return NextResponse.json(
    { latest: `${writes}:${latest?.createdAt.toISOString() ?? "none"}` },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export const dynamic = "force-dynamic";
