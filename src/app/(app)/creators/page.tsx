import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClient } from "@/lib/rbac";
import { PLATFORM_LABELS } from "@/lib/constants";
import { bestNicheMatchScore } from "@/lib/nicheMatch";
import ScoutingBoard from "./scouting-board";

export default async function CreatorsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (isClient(user.role)) redirect("/dashboard");

  const [scouted, campaigns, campaignBriefs] = await Promise.all([
    prisma.scoutedCreator.findMany({ orderBy: { score: "desc" } }),
    prisma.campaign.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.campaign.findMany({ where: { status: "ACTIVE" }, select: { brief: true } }),
  ]);

  // Silent re-rank: creators whose niche best fits an active campaign's
  // brief surface first. Backend-only — no score/badge is exposed, the
  // ScoutingBoard component and its props are unchanged, only fetch order.
  // Rejected creators always sink to the bottom regardless of fit/score —
  // once someone's rejected a creator, it shouldn't keep competing for a
  // spot near the top of the list.
  const rankedScouted = [...scouted].sort((a, b) => {
    const aRejected = a.status === "REJECTED" ? 1 : 0;
    const bRejected = b.status === "REJECTED" ? 1 : 0;
    if (aRejected !== bRejected) return aRejected - bRejected;

    const aFit = bestNicheMatchScore(a.niche, campaignBriefs);
    const bFit = bestNicheMatchScore(b.niche, campaignBriefs);
    if (aFit !== bFit) return bFit - aFit;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-ink">Creator Intelligence</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Discovery and qualification queue. Creators here are scored against fit criteria before being promoted into a
        campaign shortlist. Sourced via approved data providers, official APIs, or manual import — never scraped or
        automated against a platform's terms (see README "Creator Intelligence Engine").
      </p>
      <ScoutingBoard scouted={rankedScouted} campaigns={campaigns} />
    </div>
  );
}
