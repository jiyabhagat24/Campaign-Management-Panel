// Shared upsert into InstagramProfileCache — used by both the extension's
// POST endpoint (one profile at a time, real-time) and the daily Google
// Sheets sync (many profiles at once, scheduled). One code path so the two
// sources can never drift in how they normalize/store data.

import { prisma } from "@/lib/prisma";
import { extractInstagramUsername } from "@/lib/instagram";

export type InstagramProfileInput = {
  username: string;
  profileUrl?: string | null;
  contactEmail?: string | null;
  followers?: number | null;
  postsCount?: number | null;
  avgViews?: number | null;
  engagementRate?: number | null;
  // When the source actually captured this (e.g. the extension's capture
  // timestamp from the sheet). If omitted, defaults to "now" — i.e. when
  // this upsert runs, which is right for real-time extension POSTs but
  // would be misleading for the sheet sync (would make week-old captures
  // look fresh every time the daily sync runs) unless passed through.
  capturedAt?: Date | string | null;
};

// `|| null` here used to turn a legitimate 0 into null (0 is falsy in JS) —
// fixed to only fall back to null for actual non-numbers (NaN), so a real
// zero-followers/zero-posts capture stays 0 instead of silently vanishing.
const toIntOrNull = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isNaN(n) ? null : n;
};
const toFloatOrNull = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const toStrOrNull = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));
const toDateOrNow = (v: unknown) => {
  if (!v) return new Date();
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

export async function upsertInstagramProfile(input: InstagramProfileInput) {
  const username = extractInstagramUsername(input.username);
  if (!username) throw new Error("Missing/invalid username.");

  const capturedAt = toDateOrNow(input.capturedAt);

  const data = {
    username,
    profileUrl: toStrOrNull(input.profileUrl) ?? `https://instagram.com/${username}`,
    contactEmail: toStrOrNull(input.contactEmail),
    followers: toIntOrNull(input.followers),
    postsCount: toIntOrNull(input.postsCount),
    avgViews: toIntOrNull(input.avgViews),
    engagementRate: toFloatOrNull(input.engagementRate),
    capturedAt,
  };

  return prisma.instagramProfileCache.upsert({
    where: { username },
    create: data,
    update: data,
  });
}

// Upserts many at once (the sheet sync path) — sequential, not Promise.all,
// so one bad row can't spike DB connections and so the error message for a
// failed row is traceable to that row instead of a swallowed Promise.all
// rejection.
export async function upsertInstagramProfiles(inputs: InstagramProfileInput[]) {
  const results: Array<{ username: string; ok: boolean; error?: string }> = [];
  for (const input of inputs) {
    try {
      const saved = await upsertInstagramProfile(input);
      results.push({ username: saved.username, ok: true });
    } catch (err) {
      results.push({ username: input.username, ok: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }
  return results;
}
