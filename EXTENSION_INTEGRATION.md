# Wiring your browser extension into the campaign panel

Your extension captures Instagram profile data as you manually browse (not
automated/scheduled scraping — that distinction matters, see
`SETUP_INSTAGRAM.md` for why). This doc is the contract for how it talks to
this app.

## Endpoint

```
POST /api/extension/instagram-profile
```

Locally: `http://localhost:3000/api/extension/instagram-profile`
In production: your deployed domain instead of localhost.

## Auth

Header:
```
x-api-key: <value of EXTENSION_API_KEY from .env>
```

Generate a random value for `EXTENSION_API_KEY` (e.g. `openssl rand -hex 24`),
put it in `.env`, restart `npm run dev`, and hardcode the same value into
your extension's config/options page — it's a machine credential between
your extension and your own server, not a user login.

## Request body (JSON)

Only `username` (or `profileUrl`) is required — send whatever else your
extension actually captures, omit the rest:

```json
{
  "username": "someinfluencer",
  "profileUrl": "https://instagram.com/someinfluencer",
  "contactEmail": "someinfluencer@gmail.com",
  "followers": 152000,
  "postsCount": 812,
  "avgViews": 48000,
  "engagementRate": 4.2
}
```

- `username` can be a bare handle (`someinfluencer`) or a full profile URL —
  either way it's normalized before saving.
- `engagementRate` is a percent, e.g. `4.2` for 4.2%.
- Every field is upserted: posting the same username again overwrites the
  previous capture with the new one (last capture wins — no history kept,
  since the campaign panel only ever wants the latest snapshot for auto-fill).

## Response

Success:
```json
{ "ok": true, "username": "someinfluencer", "updatedAt": "2026-08-11T..." }
```

Errors: `401` (bad/missing API key), `400` (bad body), `503` (server hasn't
got `EXTENSION_API_KEY` configured yet) — all with `{ "error": "..." }`.

## How it's used

When someone pastes `https://instagram.com/someinfluencer` into "Profile
URL" on the Add Influencer form and tabs away, the app looks up
`someinfluencer` in this cache. If your extension (or the daily sheet sync)
already captured that profile, it fills in followers, avg views, and
engagement rate instantly. This is database-only by design — if nothing's
cached yet for that username, it says so clearly instead of calling any
external API.

## Testing without the real extension

```bash
curl -X POST http://localhost:3000/api/extension/instagram-profile \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_EXTENSION_API_KEY" \
  -d '{
    "username": "testcreator",
    "followers": 50000,
    "avgViews": 12000,
    "engagementRate": 3.8
  }'
```

Then paste `instagram.com/testcreator` into the Add Influencer form — it
should auto-fill from this cached data instantly.
