// YouTube Data API v3 client — the official, free way to pull public channel
// stats (subscriber count, and video-level view/like/comment counts used to
// estimate Median Views/ER%). No scraping — same rule as Instagram.
//
// Median Views/ER% methodology (matches the shortlist sheet's own spec):
// pull the channel's most recent uploads, split them into long-form vs
// Shorts by duration (<=180s = Shorts, matching YouTube's Oct 2024 Shorts
// definition — most creators now post Shorts well past the old 60s cap),
// then per bucket:
//   Median Views = median(viewCount) across that bucket's videos
//   Median ER%   = (median(likeCount) + median(commentCount)) / Median Views * 100
// This intentionally omits "outlier removal" beyond using the median itself
// (which already resists outliers much better than a mean would) — a fuller
// outlier-band detection is possible later if the simple median proves too
// noisy in practice.
//
// Setup: see SETUP_YOUTUBE.md for how to get YOUTUBE_API_KEY. Until that's
// set, lookups fail gracefully and the caller falls back to manual entry.

const API_BASE = "https://www.googleapis.com/youtube/v3";
// Pulled, then split into long-form/Shorts buckets. 50 is the API's max
// page size for playlistItems — bumped up from 15 because a channel that
// posts in bursts (e.g. several long videos in a row) can otherwise have
// its most recent 15 uploads land entirely in one bucket, leaving the other
// bucket's Median Views/ER% blank even though the channel clearly posts
// both. One extra API page, same quota cost either way.
const RECENT_VIDEO_SAMPLE_SIZE = 50;
const SHORTS_MAX_SECONDS = 180; // YouTube's current Shorts ceiling (raised from 60s in Oct 2024)

export type YoutubeChannelStats = {
  channelId: string;
  subscribers: number | null;
  longMedianViews: number | null;
  longMedianERPercent: number | null;
  shortsMedianViews: number | null;
  shortsMedianERPercent: number | null;
};

export class YoutubeLookupError extends Error {
  code: "NOT_CONFIGURED" | "INVALID_URL" | "NOT_FOUND" | "RATE_LIMITED" | "API_ERROR";
  constructor(code: YoutubeLookupError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "YoutubeLookupError";
  }
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// "PT4M13S" -> 253, "PT58S" -> 58, "PT1H2M" -> 3720
function parseIsoDurationToSeconds(duration: string): number {
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

async function apiGet(path: string, params: Record<string, string>): Promise<any> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new YoutubeLookupError(
      "NOT_CONFIGURED",
      "YouTube lookup isn't set up yet. Add YOUTUBE_API_KEY to .env — see SETUP_YOUTUBE.md."
    );
  }
  const url = `${API_BASE}${path}?${new URLSearchParams({ ...params, key: apiKey }).toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new YoutubeLookupError("API_ERROR", "Couldn't reach YouTube's API. Check your connection and try again.");
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    const reason: string | undefined = json?.error?.errors?.[0]?.reason ?? json?.error?.status;
    if (reason === "quotaExceeded" || reason === "rateLimitExceeded" || res.status === 429) {
      throw new YoutubeLookupError("RATE_LIMITED", "YouTube API quota hit for today — try again tomorrow, or enter these numbers manually.");
    }
    throw new YoutubeLookupError("API_ERROR", json?.error?.message ?? "YouTube API returned an error.");
  }
  return json;
}

// Accepts /channel/UC..., /@handle, /c/Name, /user/Name, or a bare handle.
// Resolves whichever form to a channelId + uploads playlist via the API.
async function resolveChannel(rawInput: string): Promise<{ channelId: string; uploadsPlaylistId: string; subscribers: number | null }> {
  const trimmed = rawInput.trim();
  if (!trimmed) throw new YoutubeLookupError("INVALID_URL", "Enter a YouTube channel URL.");

  const channelIdMatch = trimmed.match(/youtube\.com\/channel\/([^/?#]+)/i);
  const handleMatch = trimmed.match(/youtube\.com\/(@[^/?#]+)/i) ?? (trimmed.startsWith("@") ? [null, trimmed] : null);
  const legacyMatch = trimmed.match(/youtube\.com\/(?:c|user)\/([^/?#]+)/i);

  let json: any;
  if (channelIdMatch) {
    json = await apiGet("/channels", { part: "snippet,statistics,contentDetails", id: channelIdMatch[1] });
  } else if (handleMatch) {
    json = await apiGet("/channels", { part: "snippet,statistics,contentDetails", forHandle: handleMatch[1] });
  } else {
    // Custom URL (/c/Name, /user/Name) or a bare name — no direct lookup
    // param covers these reliably, so fall back to search (costs more quota
    // but works for any input shape).
    const query = legacyMatch ? legacyMatch[1] : trimmed.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "");
    const searchJson = await apiGet("/search", { part: "snippet", type: "channel", q: query, maxResults: "1" });
    const channelId = searchJson.items?.[0]?.snippet?.channelId ?? searchJson.items?.[0]?.id?.channelId;
    if (!channelId) throw new YoutubeLookupError("NOT_FOUND", `Couldn't find a YouTube channel matching "${trimmed}".`);
    json = await apiGet("/channels", { part: "snippet,statistics,contentDetails", id: channelId });
  }

  const channel = json.items?.[0];
  if (!channel) throw new YoutubeLookupError("NOT_FOUND", "Couldn't find that YouTube channel.");

  return {
    channelId: channel.id,
    uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads,
    subscribers: channel.statistics?.hiddenSubscriberCount ? null : Number(channel.statistics?.subscriberCount ?? 0),
  };
}

// Wikipedia topic URL -> readable label, e.g.
// "https://en.wikipedia.org/wiki/Lifestyle_(sociology)" -> "Lifestyle (sociology)"
function topicUrlToLabel(url: string): string {
  const slug = url.split("/wiki/")[1] ?? url;
  return decodeURIComponent(slug).replace(/_/g, " ").trim();
}

// Auto-detects a creator's niche from their channel's YouTube-assigned topic
// categories (topicDetails.topicCategories) — used to auto-fill the scouting
// queue's niche field instead of relying on manual entry. Returns null (not
// a thrown error) on anything short of a real API failure, since niche
// detection is a nice-to-have and should never block adding a creator.
// Verifies a handle/URL actually resolves to a real, live YouTube channel
// via the API, and returns the canonical /channel/UC... link for it — the
// one form of YouTube URL that's always valid and always redirects
// correctly, regardless of whether the handle text was typed by hand or is
// stale/misspelled. Returns null (never throws) if the channel can't be
// confirmed, so callers can fall back to a best-effort guess instead of
// saving a link that might 404.
export async function resolveYoutubeChannelCanonicalUrl(rawInput: string): Promise<string | null> {
  try {
    const { channelId } = await resolveChannel(rawInput);
    return channelId ? `https://www.youtube.com/channel/${channelId}` : null;
  } catch {
    return null;
  }
}

export async function fetchYoutubeChannelNiche(rawInput: string): Promise<string | null> {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const channelIdMatch = trimmed.match(/youtube\.com\/channel\/([^/?#]+)/i);
  const handleMatch = trimmed.match(/youtube\.com\/(@[^/?#]+)/i) ?? (trimmed.startsWith("@") ? [null, trimmed] : null);
  const legacyMatch = trimmed.match(/youtube\.com\/(?:c|user)\/([^/?#]+)/i);

  let json: any;
  if (channelIdMatch) {
    json = await apiGet("/channels", { part: "topicDetails", id: channelIdMatch[1] });
  } else if (handleMatch) {
    json = await apiGet("/channels", { part: "topicDetails", forHandle: handleMatch[1] });
  } else {
    const query = legacyMatch ? legacyMatch[1] : trimmed.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "");
    const searchJson = await apiGet("/search", { part: "snippet", type: "channel", q: query, maxResults: "1" });
    const channelId = searchJson.items?.[0]?.snippet?.channelId ?? searchJson.items?.[0]?.id?.channelId;
    if (!channelId) return null;
    json = await apiGet("/channels", { part: "topicDetails", id: channelId });
  }

  const categories: string[] = json.items?.[0]?.topicDetails?.topicCategories ?? [];
  if (categories.length === 0) return null;

  const labels = categories.map(topicUrlToLabel).filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : null;
}

// Matches an Instagram handle or profile URL inside free text — used to
// spot creators who've listed their Instagram in their YouTube channel's
// About/description ("IG: @name", "instagram.com/name", etc). Picks the
// first match; deliberately conservative (word-boundary + reasonable
// length) to avoid false-positives on unrelated @-mentions or hashtags.
export function extractInstagramHandleFromText(text: string): string | null {
  if (!text) return null;

  const urlMatch = text.match(/instagram\.com\/([a-z0-9._]{2,30})/i);
  if (urlMatch) return urlMatch[1].replace(/\/$/, "");

  const labeledMatch = text.match(/(?:instagram|ig)\s*[:@\-]?\s*@([a-z0-9._]{2,30})/i);
  if (labeledMatch) return labeledMatch[1];

  return null;
}

// Pulls a channel's About/description text and extracts an Instagram handle
// from it, if the creator listed one. Same best-effort contract as
// fetchYoutubeChannelNiche — returns null rather than throwing, since this
// is a bonus lookup that shouldn't block adding a creator.
export async function fetchYoutubeChannelInstagramHandle(rawInput: string): Promise<string | null> {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const channelIdMatch = trimmed.match(/youtube\.com\/channel\/([^/?#]+)/i);
  const handleMatch = trimmed.match(/youtube\.com\/(@[^/?#]+)/i) ?? (trimmed.startsWith("@") ? [null, trimmed] : null);
  const legacyMatch = trimmed.match(/youtube\.com\/(?:c|user)\/([^/?#]+)/i);

  let json: any;
  if (channelIdMatch) {
    json = await apiGet("/channels", { part: "snippet", id: channelIdMatch[1] });
  } else if (handleMatch) {
    json = await apiGet("/channels", { part: "snippet", forHandle: handleMatch[1] });
  } else {
    const query = legacyMatch ? legacyMatch[1] : trimmed.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "");
    const searchJson = await apiGet("/search", { part: "snippet", type: "channel", q: query, maxResults: "1" });
    const channelId = searchJson.items?.[0]?.snippet?.channelId ?? searchJson.items?.[0]?.id?.channelId;
    if (!channelId) return null;
    json = await apiGet("/channels", { part: "snippet", id: channelId });
  }

  const description: string = json.items?.[0]?.snippet?.description ?? "";
  return extractInstagramHandleFromText(description);
}

export type YoutubeChannelSearchResult = {
  channelId: string;
  handle: string | null;
  title: string;
  // The channel's self-declared country from its "About" page (ISO 3166-1
  // alpha-2, e.g. "IN"). Not every channel sets this — null means unknown,
  // not "not Indian". See isLikelyIndianChannel() for how callers use this.
  country: string | null;
};

// Searches YouTube for channels matching free text (e.g. a campaign brief)
// and resolves each hit's @handle + country via a follow-up channels.list
// call, since search results only carry a channelId. regionCode biases
// YouTube's own ranking toward India without hard-filtering — combine with
// isLikelyIndianChannel() for an actual filter. Used by automatic creator
// discovery — see src/lib/youtubeDiscovery.ts.
export async function searchYoutubeChannels(
  query: string,
  maxResults: number,
  options?: { regionCode?: string }
): Promise<YoutubeChannelSearchResult[]> {
  const searchJson = await apiGet("/search", {
    part: "snippet",
    type: "channel",
    q: query,
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
    ...(options?.regionCode ? { regionCode: options.regionCode } : {}),
  });

  const channelIds: string[] = (searchJson.items ?? [])
    .map((i: any) => i.snippet?.channelId ?? i.id?.channelId)
    .filter(Boolean);
  if (channelIds.length === 0) return [];

  const detailsJson = await apiGet("/channels", { part: "snippet", id: channelIds.join(",") });
  const items: any[] = detailsJson.items ?? [];

  return channelIds.map((channelId) => {
    const channel = items.find((c) => c.id === channelId);
    const customUrl: string | undefined = channel?.snippet?.customUrl;
    const handle = customUrl ? (customUrl.startsWith("@") ? customUrl : `@${customUrl}`) : null;
    const country: string | null = channel?.snippet?.country ?? null;
    return { channelId, handle, title: channel?.snippet?.title ?? "Unknown channel", country };
  });
}

// A channel counts as "likely Indian" if it explicitly declared India as
// its country. A channel that hasn't set a country at all is left as
// "unknown" rather than excluded — plenty of real Indian creators never
// fill that field in, and hard-excluding them would silently starve the
// discovery pipeline. Callers decide whether to keep or skip unknowns.
export function isLikelyIndianChannel(country: string | null): "yes" | "no" | "unknown" {
  if (country === null) return "unknown";
  return country === "IN" ? "yes" : "no";
}

// YouTube channel IDs are "UC" + 22 chars. Swapping that "UC" prefix for
// "UU"/"UULF"/"UUSH" resolves to the same auto-generated playlists that
// back the channel's own Uploads/Videos/Shorts tabs — this is how YouTube
// itself classifies a video as a Short (aspect ratio + duration + Shorts-
// shelf placement), not a guess. Undocumented but stable and widely relied
// on, since the official Data API has no isShort field. Falls back to a
// duration heuristic (below) for the rare channel where one of these
// derived playlists 404s.
function derivedPlaylistId(channelId: string, infix: "" | "LF" | "SH"): string | null {
  if (!channelId.startsWith("UC")) return null;
  return `UU${infix}${channelId.slice(2)}`;
}

// Like apiGet but treats "this playlist doesn't exist" (a channel with zero
// Shorts has no UUSH playlist at all, same for zero long-form and UULF) as
// an empty list instead of a hard failure — the other bucket should still
// come back with real data.
async function fetchPlaylistVideoIds(playlistId: string, max: number): Promise<string[]> {
  try {
    const json = await apiGet("/playlistItems", { part: "contentDetails", playlistId, maxResults: String(max) });
    return (json.items ?? []).map((i: any) => i.contentDetails?.videoId).filter(Boolean);
  } catch (err) {
    if (err instanceof YoutubeLookupError && (err.code === "NOT_FOUND" || err.code === "API_ERROR")) return [];
    throw err;
  }
}

function bucketStats(bucket: Array<{ views: number; likes: number; comments: number }>) {
  const medianViews = median(bucket.map((v) => v.views));
  const medianLikes = median(bucket.map((v) => v.likes)) ?? 0;
  const medianComments = median(bucket.map((v) => v.comments)) ?? 0;
  const medianER = medianViews && medianViews > 0 ? Math.round(((medianLikes + medianComments) / medianViews) * 1000) / 10 : null;
  return { medianViews, medianER };
}

async function statsForVideoIds(videoIds: string[]) {
  if (videoIds.length === 0) return [] as Array<{ views: number; likes: number; comments: number; seconds: number }>;
  const videosJson = await apiGet("/videos", { part: "statistics,contentDetails", id: videoIds.join(",") });
  return (videosJson.items ?? []).map((v: any) => ({
    views: Number(v.statistics?.viewCount ?? 0),
    likes: Number(v.statistics?.likeCount ?? 0),
    comments: Number(v.statistics?.commentCount ?? 0),
    seconds: parseIsoDurationToSeconds(v.contentDetails?.duration ?? "PT0S"),
  }));
}

export async function fetchYoutubeChannelStats(rawInput: string): Promise<YoutubeChannelStats> {
  const { channelId, uploadsPlaylistId, subscribers } = await resolveChannel(rawInput);

  if (!uploadsPlaylistId) {
    return { channelId, subscribers, longMedianViews: null, longMedianERPercent: null, shortsMedianViews: null, shortsMedianERPercent: null };
  }

  const longPlaylistId = derivedPlaylistId(channelId, "LF");
  const shortsPlaylistId = derivedPlaylistId(channelId, "SH");

  let longVideoIds: string[] = [];
  let shortsVideoIds: string[] = [];
  if (longPlaylistId && shortsPlaylistId) {
    [longVideoIds, shortsVideoIds] = await Promise.all([
      fetchPlaylistVideoIds(longPlaylistId, RECENT_VIDEO_SAMPLE_SIZE),
      fetchPlaylistVideoIds(shortsPlaylistId, RECENT_VIDEO_SAMPLE_SIZE),
    ]);
  }

  const [longVideos, shortsVideos] = await Promise.all([statsForVideoIds(longVideoIds), statsForVideoIds(shortsVideoIds)]);
  let long = bucketStats(longVideos);
  let shorts = bucketStats(shortsVideos);

  // Fallback — per bucket, not all-or-nothing. The derived UUSH/UULF
  // playlists are an undocumented YouTube trick and can miss just one
  // bucket even when the channel clearly has uploads there (e.g. its Shorts
  // auto-playlist hasn't materialized yet while long-form's has). Whichever
  // bucket came back empty gets re-derived from the general uploads
  // playlist, split by duration, instead of leaving it permanently null.
  if (longVideoIds.length === 0 || shortsVideoIds.length === 0) {
    const uploadsIds = await fetchPlaylistVideoIds(uploadsPlaylistId, RECENT_VIDEO_SAMPLE_SIZE);
    const uploadsVideos = await statsForVideoIds(uploadsIds);
    if (longVideoIds.length === 0) long = bucketStats(uploadsVideos.filter((v) => v.seconds > SHORTS_MAX_SECONDS));
    if (shortsVideoIds.length === 0) shorts = bucketStats(uploadsVideos.filter((v) => v.seconds > 0 && v.seconds <= SHORTS_MAX_SECONDS));
  }

  return {
    channelId,
    subscribers,
    longMedianViews: long.medianViews,
    longMedianERPercent: long.medianER,
    shortsMedianViews: shorts.medianViews,
    shortsMedianERPercent: shorts.medianER,
  };
}
