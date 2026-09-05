// Instagram Graph API "Business Discovery" client — the one free, official way
// to pull public profile stats for another account. Only works for accounts
// that are set up as Business or Creator (most influencers are, but personal
// accounts return nothing — that's a Meta restriction, not something we can
// work around, and we deliberately don't try to).
//
// What this can and can't give us:
//   - followers_count: real, direct from Meta.
//   - engagement rate: computed from likes + comments on the account's most
//     recent public posts (Business Discovery exposes those two fields).
//   - avg views: NOT available. Meta only exposes video/reel play counts via
//     the private /insights edge, which only works for accounts you own.
//     Any "avg views" from a free API for someone else's account would be a
//     guess dressed up as data, so we leave it blank for the user to fill in
//     manually (e.g. from the creator's own media kit).
//
// Setup: see SETUP_INSTAGRAM.md for how to get INSTAGRAM_ACCESS_TOKEN and
// INSTAGRAM_BUSINESS_ACCOUNT_ID.

const GRAPH_API_VERSION = "v21.0";
const MEDIA_SAMPLE_SIZE = 12; // recent posts to average engagement over

export type InstagramProfileLookup = {
  username: string;
  name: string | null;
  followers: number;
  mediaCount: number;
  engagementRate: number | null; // percent, e.g. 4.2. null if no public posts to sample.
  profilePictureUrl: string | null;
  postsSampled: number;
};

export class InstagramLookupError extends Error {
  code: "NOT_CONFIGURED" | "INVALID_URL" | "NOT_FOUND" | "NOT_BUSINESS_ACCOUNT" | "RATE_LIMITED" | "API_ERROR";
  constructor(code: InstagramLookupError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "InstagramLookupError";
  }
}

// Accepts a full profile URL (https://instagram.com/name/, with or without
// query params/trailing slash) or a bare @handle / handle.
export function extractInstagramUsername(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) return urlMatch[1];
  return trimmed.replace(/^@/, "");
}

export async function lookupInstagramProfile(rawInput: string): Promise<InstagramProfileLookup> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !businessAccountId) {
    throw new InstagramLookupError(
      "NOT_CONFIGURED",
      "Instagram lookup isn't set up yet. Add INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID to .env — see SETUP_INSTAGRAM.md."
    );
  }

  const username = extractInstagramUsername(rawInput);
  if (!username) {
    throw new InstagramLookupError("INVALID_URL", "Couldn't find a username in that URL.");
  }

  const fields =
    `business_discovery.username(${username})` +
    `{username,name,followers_count,media_count,profile_picture_url,` +
    `media.limit(${MEDIA_SAMPLE_SIZE}){like_count,comments_count,media_type,timestamp}}`;

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${businessAccountId}?fields=${encodeURIComponent(fields)}&access_token=${accessToken}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new InstagramLookupError("API_ERROR", "Couldn't reach Instagram's API. Check your connection and try again.");
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || !json) {
    const metaMessage: string | undefined = json?.error?.message;
    const metaCode: number | undefined = json?.error?.code;

    if (metaCode === 100 || /does not exist|cannot be loaded/i.test(metaMessage ?? "")) {
      throw new InstagramLookupError(
        "NOT_FOUND",
        `Couldn't find @${username}, or it isn't a Business/Creator account (Instagram only exposes public stats for those account types).`
      );
    }
    if (metaCode === 4 || metaCode === 17 || metaCode === 32) {
      throw new InstagramLookupError("RATE_LIMITED", "Instagram API rate limit hit — wait a bit and try again.");
    }
    throw new InstagramLookupError("API_ERROR", metaMessage ?? "Instagram API returned an error.");
  }

  const discovery = json.business_discovery;
  if (!discovery) {
    throw new InstagramLookupError(
      "NOT_BUSINESS_ACCOUNT",
      `@${username} doesn't look like a Business/Creator account, so Instagram won't expose its public stats via the free API.`
    );
  }

  const media: Array<{ like_count?: number; comments_count?: number }> = discovery.media?.data ?? [];
  let engagementRate: number | null = null;
  if (media.length > 0 && discovery.followers_count > 0) {
    const avgInteractions =
      media.reduce((sum, m) => sum + (m.like_count ?? 0) + (m.comments_count ?? 0), 0) / media.length;
    engagementRate = Math.round((avgInteractions / discovery.followers_count) * 1000) / 10; // 1 decimal place
  }

  return {
    username: discovery.username ?? username,
    name: discovery.name ?? null,
    followers: discovery.followers_count ?? 0,
    mediaCount: discovery.media_count ?? 0,
    engagementRate,
    profilePictureUrl: discovery.profile_picture_url ?? null,
    postsSampled: media.length,
  };
}
