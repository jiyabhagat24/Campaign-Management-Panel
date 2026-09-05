// Silent backend-only ranking: how well a scouted creator's niche fits an
// active campaign's brief. No score or badge is ever shown in the UI — this
// only changes the order the scouting queue is returned in. See
// src/app/(app)/creators/page.tsx for where this gets applied.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "with", "in", "on", "at",
  "is", "are", "be", "will", "we", "our", "it", "this", "that", "as", "by",
  "from", "into", "content", "campaign", "creator", "creators", "brand",
  // Deliverable/format/instruction words — describe HOW content gets made
  // or posted, not WHAT it's about, so they actively hurt a topic search
  // (e.g. "YouTube reviews Instagram Reels mandatory camera shot minimum"
  // pulled in generic lifestyle/science channels instead of skincare ones).
  "youtube", "instagram", "reel", "reels", "review", "reviews", "video",
  "videos", "shorts", "post", "posts", "story", "stories", "mandatory",
  "minimum", "camera", "shot", "form", "mix", "launch", "use", "second",
  "seconds", "sec", "min", "long", "short", "dedicated", "integrated",
  "conceptual", "collab",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

// All distinct significant words in a text, in original order of
// appearance — no limit, this is the full pool rotatingKeywordWindow()
// picks a slice out of.
function allKeywords(text: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length <= 2 || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    words.push(raw);
  }
  return words;
}

// A short keyword string good enough to hand to a search API (e.g. YouTube's
// channel search) — pulls the first N distinct significant words out of a
// campaign brief, in original order of appearance. Kept for callers that
// genuinely want the same query every time; auto-discovery uses
// rotatingKeywordWindow() instead so it doesn't ask the same question every
// run (see comment there).
export function topKeywords(text: string, limit = 8): string[] {
  return allKeywords(text).slice(0, limit);
}

// Same idea as topKeywords, but the N-word slice shifts over time instead of
// always being the first N words. Without this, a brief longer than the
// window size produces the EXACT same search query on every scheduled run,
// so YouTube keeps returning the same top channels forever — they're
// already in the queue, so every run just reports duplicates and nothing
// new ever surfaces. Shifting the window means each run asks a slightly
// different question and turns up different candidates over time, cycling
// back around once it's worked through the whole brief.
export function rotatingKeywordWindow(text: string, windowSize = 8, periodMs = 1000 * 60 * 60 * 8): string[] {
  const pool = allKeywords(text);
  if (pool.length <= windowSize) return pool;

  const tick = Math.floor(Date.now() / periodMs);
  const start = tick % pool.length;
  const window: string[] = [];
  for (let i = 0; i < windowSize; i++) {
    window.push(pool[(start + i) % pool.length]);
  }
  return window;
}

// 0-1 overlap score between a creator's niche string ("Lifestyle, Food") and
// a campaign's free-text brief. Simple shared-keyword ratio — deterministic
// and cheap, no external calls. Swap for embeddings later if free-text
// niche/brief drift makes keyword overlap too noisy.
export function nicheMatchScore(niche: string | null, brief: string | null): number {
  if (!niche || !brief) return 0;
  const nicheWords = tokenize(niche);
  const briefWords = tokenize(brief);
  if (nicheWords.size === 0 || briefWords.size === 0) return 0;

  let overlap = 0;
  for (const w of nicheWords) {
    if (briefWords.has(w)) overlap++;
  }
  return overlap / nicheWords.size;
}

// Best fit across all active campaigns — a creator only needs to match one
// brief well to rank higher, not every campaign at once.
export function bestNicheMatchScore(niche: string | null, campaigns: { brief: string | null }[]): number {
  if (campaigns.length === 0) return 0;
  let best = 0;
  for (const c of campaigns) {
    const s = nicheMatchScore(niche, c.brief);
    if (s > best) best = s;
  }
  return best;
}
