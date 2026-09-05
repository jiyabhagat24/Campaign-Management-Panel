# Setting up YouTube auto-fill (free, official)

This connects the "Add Influencer" form's auto-fill (paste a YouTube channel
URL → subscribers + Median Views/ER% fill in automatically) to the
**YouTube Data API v3** — a free, official Google API. No scraping.

**What it gives you:**
- **Audience Size**: subscriber count, direct from the API.
- **Median Views / Median ER%**, split separately for long-form uploads and
  Shorts (Shorts and long-form perform very differently, so they're never
  averaged together): the app pulls the channel's most recent uploads,
  splits them by video length (≤60s = Shorts), and computes the median
  views and median (likes + comments) / median views per bucket.
- Works for **any public YouTube channel** — no special account type needed
  (unlike Instagram's Business/Creator requirement).

**Limits:**
- The free tier has a daily quota (10,000 units/day — a channel lookup with
  its recent videos costs a few hundred units, so this comfortably covers
  normal day-to-day use). Results are cached for 24 hours per channel so
  repeat lookups don't burn quota.
- If a channel has fewer than a handful of long-form uploads or Shorts,
  that bucket's numbers may come back blank — there isn't enough to
  compute a median from.

## Steps

1. **Go to** [console.cloud.google.com](https://console.cloud.google.com/)
   and create a project (or reuse the one from the Google Sheets sync setup
   — this is a separate API within the same kind of project, doesn't need to
   be a new one).

2. **Enable the API:** APIs & Services → Library → search "YouTube Data API
   v3" → Enable.

3. **Create an API key:** APIs & Services → Credentials → Create Credentials
   → API key. Copy the key.

4. **(Recommended) Restrict the key** so it can only be used for this API:
   click the key you just created → under "API restrictions" select
   "Restrict key" → check "YouTube Data API v3" → Save. This limits the
   blast radius if the key ever leaks.

5. **Add it to `.env`:**
   ```
   YOUTUBE_API_KEY="your-api-key-here"
   ```
   Restart `npm run dev` after editing `.env` (env vars are only read on
   server start).

6. **Test it:** open a campaign → Shortlist tab → "+ Add Influencer to
   Shortlist" → paste any public YouTube channel URL (a `/channel/UC.../`,
   `/@handle`, `/c/Name`, or `/user/Name` link all work) into "YouTube
   channel URL" and tab away. Subscribers and Median Views/ER% should fill
   in within a couple seconds.

## Until you set this up

Pasting a YouTube URL before `YOUTUBE_API_KEY` is set shows a small message
saying auto-fill isn't configured yet instead of silently failing — IR just
enters those numbers manually in the Shortlist table instead, same as always.
