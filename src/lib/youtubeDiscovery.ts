// Automatic creator discovery for YouTube. Not something anyone clicks —
// this is the "find new creators for me" job, meant to be hit by a
// scheduler (see src/app/api/cron/discover-youtube-creators/route.ts), the
// same pattern as sync-instagram-sheet.
//
// For every active campaign, it searches YouTube for channels matching the
// campaign's brief, skips anything already in the scouting queue, pulls
// each new channel's stats + auto-detected niche, and inserts it into
// ScoutedCreator with source "AUTO_DISCOVERY_YOUTUBE". The existing niche/
// brief ranking in src/app/(app)/creators/page.tsx then silently sorts
// these into place next to manually-added creators — no separate UI needed.

import { prisma } from "@/lib/prisma";
import { rotatingKeywordWindow } from "@/lib/nicheMatch";
import {
  searchYoutubeChannels,
  fetchYoutubeChannelStats,
  fetchYoutubeChannelNiche,
  fetchYoutubeChannelInstagramHandle,
  isLikelyIndianChannel,
  YoutubeLookupError,
} from "@/lib/youtube";
import { appendInstagramHandleToSheet } from "@/lib/googleSheets";
import { MIN_SCOUTING_FOLLOWERS } from "@/lib/constants";

// YouTube's search endpoint costs the same 100 quota units per call no
// matter how many results you ask for (up to its own max of 50), so raising
// this doesn't meaningfully change quota usage — the per-channel detail
// lookups that follow (stats + niche, a few units each) are what scale with
// this number, and even 50 channels is still cheap against the 10,000/day
// free quota.
const RESULTS_PER_CAMPAIGN = 50;

// Mirrors scoreCreator() in src/lib/actions.ts — kept as a local copy since
// that file is a "use server" action module and isn't meant to be imported
// from a plain lib module. Keep the two in sync if the formula changes.
function scoreCreator(input: { followers: number | null; avgViews: number | null; engagementRate: number | null }) {
  const reachScore = input.avgViews ? Math.min(50, Math.log10(input.avgViews + 1) * 10) : 0;
  const engagementScore = input.engagementRate ? Math.min(50, input.engagementRate * 6) : 0;
  return Math.round(reachScore + engagementScore);
}

// Same helper as actions.ts (see its comment) — duplicated rather than
// imported for the same "use server" module-boundary reason as
// scoreCreator above.
function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

export type DiscoveryRunSummary = {
  campaignsProcessed: number;
  found: number;
  added: number;
  addedCreators: { name: string; handle: string; campaign: string }[];
  skippedDuplicate: number;
  skippedNoHandle: number;
  skippedNotIndia: number;
  skippedBelowThreshold: number;
  errors: string[];
};

export async function discoverYoutubeCreatorsForActiveCampaigns(): Promise<DiscoveryRunSummary> {
  const summary: DiscoveryRunSummary = {
    campaignsProcessed: 0,
    found: 0,
    added: 0,
    addedCreators: [],
    skippedDuplicate: 0,
    skippedNoHandle: 0,
    skippedNotIndia: 0,
    skippedBelowThreshold: 0,
    errors: [],
  };

  const campaigns = await prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, brief: true },
  });

  for (const campaign of campaigns) {
    summary.campaignsProcessed++;
    // The campaign name (e.g. "Skincare Launch") is included in the source
    // text too — it's often the single most on-topic word (product category)
    // and was otherwise being dropped whenever a brief was already present.
    const briefSource = `${campaign.name} ${campaign.brief ?? ""}`.trim();
    const query = rotatingKeywordWindow(briefSource, 8).join(" ") || campaign.name;

    let hits: Awaited<ReturnType<typeof searchYoutubeChannels>>;
    try {
      // regionCode biases YouTube's own ranking toward India — a soft
      // signal, not a hard filter. isLikelyIndianChannel() below does the
      // actual filtering per-channel.
      hits = await searchYoutubeChannels(query, RESULTS_PER_CAMPAIGN, { regionCode: "IN" });
    } catch (err) {
      const msg = err instanceof YoutubeLookupError ? err.message : "YouTube search failed unexpectedly.";
      summary.errors.push(`${campaign.name}: ${msg}`);
      // A RATE_LIMITED error means every subsequent search will fail too —
      // stop the run early instead of burning the rest of the loop on
      // guaranteed failures.
      if (err instanceof YoutubeLookupError && err.code === "RATE_LIMITED") break;
      continue;
    }

    for (const hit of hits) {
      summary.found++;
      if (!hit.handle) {
        summary.skippedNoHandle++;
        continue;
      }

      // Skip anything that explicitly declared a non-India country. A
      // channel with no country set at all is kept (see
      // isLikelyIndianChannel's comment) rather than excluded, since that'd
      // silently throw out plenty of real Indian creators who never filled
      // that field in.
      if (isLikelyIndianChannel(hit.country) === "no") {
        summary.skippedNotIndia++;
        continue;
      }

      const handleLower = hit.handle.toLowerCase();
      const existing = await prisma.scoutedCreator.findUnique({ where: { handleLower } });
      if (existing) {
        summary.skippedDuplicate++;
        continue;
      }

      try {
        const [stats, niche, instagramHandle] = await Promise.all([
          fetchYoutubeChannelStats(hit.handle),
          fetchYoutubeChannelNiche(hit.handle).catch(() => null),
          fetchYoutubeChannelInstagramHandle(hit.handle).catch(() => null),
        ]);

        // Skip near-empty channels — no subscriber count at all (hidden or
        // API couldn't tell) is treated as below threshold too, since we
        // can't verify it clears the bar either way.
        if (stats.subscribers === null || stats.subscribers < MIN_SCOUTING_FOLLOWERS) {
          summary.skippedBelowThreshold++;
          continue;
        }

        const avgViews = stats.longMedianViews ?? stats.shortsMedianViews;
        const engagementRate = stats.longMedianERPercent ?? stats.shortsMedianERPercent;
        const platform = stats.longMedianViews !== null ? "YOUTUBE_LONG" : "YOUTUBE_SHORTS";
        const score = scoreCreator({ followers: stats.subscribers, avgViews, engagementRate });

        await prisma.scoutedCreator.create({
          data: {
            name: hit.title,
            handle: hit.handle,
            handleLower,
            platform,
            followers: stats.subscribers,
            avgViews,
            engagementRate,
            niche,
            instagramHandle,
            score,
            source: "AUTO_DISCOVERY_YOUTUBE",
          },
        });
        summary.added++;
        summary.addedCreators.push({ name: hit.title, handle: hit.handle, campaign: campaign.name });

        // Best-effort — a creator's Instagram gets picked up on the next
        // sheet sync once it's in the sheet. Failure here (sheet not
        // configured for write access yet, etc.) never blocks adding the
        // creator itself.
        if (instagramHandle) await appendInstagramHandleToSheet(instagramHandle);
      } catch (err) {
        // A unique-constraint race (this handle got added by something else
        // between the findUnique check above and this insert) isn't a real
        // error — just count it as the duplicate it is instead of reporting
        // a false failure.
        if (isUniqueConstraintError(err)) {
          summary.skippedDuplicate++;
          continue;
        }
        const msg = err instanceof YoutubeLookupError ? err.message : "Lookup failed unexpectedly.";
        summary.errors.push(`${hit.handle}: ${msg}`);
        if (err instanceof YoutubeLookupError && err.code === "RATE_LIMITED") break;
      }
    }
  }

  return summary;
}
