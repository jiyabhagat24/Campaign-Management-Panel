import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";

// Backs AutoRefresh (src/components/AutoRefresh.tsx). Previously every open
// tab called router.refresh() every 8s unconditionally — that reruns every
// Server Component query on whatever page is open, for every user, every 8
// seconds, regardless of whether anything actually changed. At 50 concurrent
// users that's 50 full page re-renders/8s as a *baseline*, before anyone
// does anything — the single biggest load source in the app.
//
// This endpoint replaces that: it returns only the timestamp of the most
// recent ActivityLog row (indexed on createdAt — effectively every write
// path in actions.ts calls logActivity, so this is a reliable "did anything
// change anywhere" proxy). One indexed row lookup instead of an entire
// page's worth of Prisma queries. AutoRefresh polls this cheaply and only
// calls the expensive router.refresh() when the timestamp actually moves.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const latest = await prisma.activityLog.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return NextResponse.json({ latest: latest?.createdAt.toISOString() ?? null });
}

export const dynamic = "force-dynamic";
