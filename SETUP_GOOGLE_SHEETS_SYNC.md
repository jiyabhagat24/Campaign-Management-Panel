# Daily sync: Google Sheet → campaign panel

Your extension writes captured Instagram data straight to a Google Sheet.
This job pulls that sheet into the panel's database once a day, so the
"paste URL" auto-fill always has your latest captured numbers, without
anyone manually re-entering anything.

## 1. Create a Google Cloud service account

A service account is a "robot" Google account this app uses to read your
sheet — no one has to log in, and it never expires the way a personal OAuth
login would.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/), create a project (or use an existing one).
2. **APIs & Services → Library** → search "Google Sheets API" → Enable.
3. **APIs & Services → Credentials** → Create Credentials → Service Account.
   Name it anything (e.g. "campaign-panel-sheets-reader"). No roles needed.
4. Open the service account you just made → **Keys** tab → Add Key → Create
   new key → JSON. This downloads a `.json` file — keep it private, it's a
   credential.
5. From that JSON file, you need two values:
   - `client_email` → this is `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → this is `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (it's a
     multi-line string starting with `-----BEGIN PRIVATE KEY-----`; paste it
     into `.env` as one line — keep the `\n` characters exactly as they
     appear in the JSON file, don't convert them to real line breaks)

## 2. Share the sheet with the service account

The service account is a separate Google account — it can't see your sheet
until you explicitly share it:

1. Open your Google Sheet.
2. Click **Share**.
3. Paste in the `client_email` from step 1 (looks like
   `something@your-project.iam.gserviceaccount.com`).
4. Give it **Viewer** access (it only needs to read, never write).

## 3. Get the Sheet ID and range

The Sheet ID is the long string in the sheet's URL:
```
https://docs.google.com/spreadsheets/d/THIS_PART_IS_THE_ID/edit
```
That's `GOOGLE_SHEETS_ID`.

`GOOGLE_SHEETS_RANGE` is the tab name (e.g. `Sheet1`) or a specific range
(e.g. `Sheet1!A:L`). Defaults to `Sheet1` if you leave it as-is.

## 4. Expected columns

The header row (first row of the sheet) can be in **any order** — columns
are matched by name, not position. Use any of these header names (not
case-sensitive):

| What it is | Accepted header names |
|---|---|
| Username (required) | `username`, `handle`, `instagram handle`, `ig handle` |
| Profile URL | `profile url`, `url`, `link` |
| Contact email | `email`, `email id`, `contact email`, `business email` |
| Followers | `followers`, `follower count` |
| Post count | `posts`, `post count`, `media count` |
| Avg views | `avg views`, `average views` |
| Engagement rate | `engagement`, `engagement rate`, `engagement %` |
| Captured at | `captured at`, `captured date`, `date captured`, `scraped at`, `timestamp` |

Only "Username" is required — leave any other column out and it's just
skipped for that row.

## 5. Add everything to `.env`

```
GOOGLE_SHEETS_ID="1a2B3c..."
GOOGLE_SHEETS_RANGE="Sheet1"
GOOGLE_SERVICE_ACCOUNT_EMAIL="campaign-panel-sheets-reader@your-project.iam.gserviceaccount.com"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
CRON_SECRET="<generate with: openssl rand -hex 24>"
```
Restart `npm run dev` after editing `.env`.

## 6. Test it manually first

Before scheduling anything, hit the sync endpoint once by hand to confirm
it works:

```
http://localhost:3000/api/cron/sync-instagram-sheet?secret=YOUR_CRON_SECRET
```

Open that URL in a browser or `curl` it. You should get back something like:
```json
{ "ok": true, "totalRows": 12, "synced": 12, "failed": 0, "syncedAt": "..." }
```
If `failed` is greater than 0, `failedDetails` tells you which usernames
failed and why (usually a bad number in a numeric column).

## 7. Schedule it to run daily

Pick whichever fits how you're running this app. **n8n (option D below) is
the recommended one** — you get a run history/dashboard showing every sync,
whether it succeeded, and why it failed if it didn't, instead of a silent
background task you can't see into.

**D. n8n (recommended) — visual scheduling + run history**

1. **Get n8n running.** Either:
   - Self-host it free: `npx n8n` (needs Node, which you already have for
     this project) — runs at `http://localhost:5678`. Or `docker run -it
     --rm -p 5678:5678 n8nio/n8n` if you prefer Docker.
   - Or use [n8n.cloud](https://n8n.io) (free trial, then paid) if you'd
     rather not self-host.
   - **Important:** if n8n is self-hosted on the same PC as this app,
     `http://localhost:3000/...` works fine as the target URL. If you use
     n8n.cloud (hosted elsewhere), it can't reach `localhost` — the
     campaign panel would need to be deployed somewhere with a real URL
     first (or you'd tunnel localhost out with something like ngrok, which
     is more of a testing tool than a permanent setup).

2. **Create a new workflow** in n8n.

3. **Add a "Schedule Trigger" node.** Set it to Days, interval 1, and pick
   a time (e.g. 6:00 AM).

4. **Add an "HTTP Request" node**, connected after the Schedule Trigger:
   - Method: `GET`
   - URL: `http://localhost:3000/api/cron/sync-instagram-sheet` (or your
     deployed URL)
   - Under "Headers", add one: `x-cron-secret` = `YOUR_CRON_SECRET` (this
     keeps the secret out of the URL/logs, unlike the `?secret=` query
     param the other options below use — either works, this is just
     tidier)

5. **(Optional but worth it) Add failure visibility.** After the HTTP
   Request node, add an "IF" node checking whether the response's `failed`
   field is greater than 0, and wire the "true" branch to an Email or
   Slack node (n8n has both built in) so you get pinged if some rows didn't
   sync — instead of finding out days later that data's stale.

6. **Activate the workflow** — toggle "Active" in the top-right of the n8n
   editor. It'll now run automatically every day, and every run (success or
   failure) shows up in n8n's Executions tab so you can see history
   whenever you want, instead of digging through server logs.

---

The other options below work too if you'd rather not run n8n at all:

**A. Vercel Cron (if you deploy this app to Vercel)** — add a `vercel.json`
in the project root:
```json
{
  "crons": [
    { "path": "/api/cron/sync-instagram-sheet?secret=YOUR_CRON_SECRET", "schedule": "0 6 * * *" }
  ]
}
```
Runs daily at 6am UTC. Vercel Cron is free on all plans for this kind of
low-frequency job.

**B. Windows Task Scheduler (if you're running this on your own PC/server)**
1. Open Task Scheduler → Create Basic Task.
2. Trigger: Daily, pick a time.
3. Action: "Start a program" → Program: `curl.exe` → Arguments:
   `"http://localhost:3000/api/cron/sync-instagram-sheet?secret=YOUR_CRON_SECRET"`
   (curl ships with Windows 10/11 by default — if missing, use
   `powershell.exe` with arguments
   `-Command "Invoke-WebRequest 'http://localhost:3000/api/cron/sync-instagram-sheet?secret=YOUR_CRON_SECRET'"`)
4. Note: the app has to actually be running (`npm run dev` or deployed) at
   that scheduled time for this to work — Task Scheduler can't start your
   dev server for you.

**C. cron-job.org (free, works if the app has a public URL — i.e. it's
deployed somewhere, not just running on localhost)**
1. Sign up at [cron-job.org](https://cron-job.org) (free tier is enough).
2. Create a cron job pointing at
   `https://your-deployed-domain.com/api/cron/sync-instagram-sheet?secret=YOUR_CRON_SECRET`.
3. Set it to run once daily.

For local development, Option B is simplest. Once you deploy this
somewhere real, Option A (if it's Vercel) or Option C is more reliable than
depending on a Task Scheduler job on a machine that might be asleep.
