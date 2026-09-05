# Campaign Management Panel

One panel for the full influencer campaign lifecycle: Brief → Shortlist → Client Review →
Negotiate → Onboard → Product → Script → Content → Go Live → Track → Report — plus a
Creator Intelligence / Scouting Engine for discovery and qualification.

This is a real, working Next.js + Prisma app: role-based auth, the full data model, and every
module wired with functional logic against a demo dataset. It's built to run locally today
and go to production once you plug in a real database and the external integrations below.

## What's already working

- Auth with 5 roles (Brand Solutions, Campaign Manager, IR Manager, IR Executive, Client),
  each seeing a different view — internal cost is hidden from IR Executive and Client by
  construction (`src/lib/rbac.ts`), not just by UI hiding.
- Campaign workspace: 11-stage pipeline bar, shortlist with dual cost fields, client
  like/negotiate/reject actions, a full negotiation round history (never overwritten),
  onboarding with commercial lock, product/script/content status tracking with frozen
  approval snapshots, go-live link + manual metric entry, in-panel remarks, and a reports tab
  with honest blended CPV.
- Creator Intelligence queue: manual import today, scoring, qualify/reject, and promotion
  straight into a campaign's shortlist.
- Full audit log (every action, who, when) and an in-app notification feed (instant vs.
  digest, per brief slide 16).
- Client attribution: clients log in with their own account, scoped to specific campaigns via
  `CampaignClientAccess` — every action is stamped against that person.

## What's stubbed, on purpose

These need real credentials/infrastructure only you can provide, so they're built as clear
extension points rather than faked:

| Area | File | What to do |
|---|---|---|
| Automated view/like/comment tracking | `src/lib/tracking.ts` | Add a YouTube Data API key; decide the Instagram data source (see below) |
| Creator discovery/scouting source | `src/lib/scouting.ts` | Pick a data provider or the Instagram Business Discovery API |
| Email delivery | `src/lib/mailer.ts` | Add SMTP credentials |
| File storage | `src/app/(app)/files/page.tsx` | Add S3/GCS upload; files are currently URL references |

## 1. Run it locally (5 minutes, zero external accounts needed)

```bash
npm install
cp .env.example .env          # defaults work as-is for local dev (SQLite)
openssl rand -base64 32       # paste the output into NEXTAUTH_SECRET in .env
npx prisma db push            # creates dev.db and all tables
npm run db:seed               # loads 5 demo users + 1 demo campaign
npm run dev
```

Open http://localhost:3000 — you'll land on the login page with demo credentials shown
(password `password123` for all). Try logging in as `priya@theboredmonkey.com` (Brand
Solutions, sees everything) and then as `aman@brand.com` (Client — notice internal cost is
gone and only the client-visible remark thread shows).

`npx prisma studio` gives you a GUI over the database if you want to poke at the raw data.

## 2. Going to a real (multi-user, persistent) database

SQLite is fine for local dev but not for a real deployment (no concurrent writes, no easy
hosting). Move to Postgres — nothing in the schema needs to change except the provider line:

1. Get a Postgres instance. Easiest options: [Supabase](https://supabase.com) or
   [Neon](https://neon.tech) (both have a free tier and give you a connection string in under
   a minute), or [Railway](https://railway.app) if you want DB + hosting together.
2. In `prisma/schema.prisma`, change:
   ```
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
   to:
   ```
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Set `DATABASE_URL` in `.env` to the connection string Supabase/Neon/Railway gives you.
4. `npx prisma db push` (or `npx prisma migrate dev` once you want real migration history
   instead of push-to-sync).
5. `npm run db:seed` again against the new database if you want the demo data there too —
   otherwise start creating real campaigns.

This is the point where I'd want you to actually run these commands with me and paste back
any errors — connection strings and IP allowlisting are the two things that usually trip
people up, and they're fast to fix together.

## 3. Auth for real use

- Rotate `NEXTAUTH_SECRET` to a real secret (never reuse the example) and set `NEXTAUTH_URL`
  to your real domain once deployed.
- User accounts are currently created only via `prisma/seed.ts` or directly in the database —
  there's no self-serve signup, which is correct per the brief ("client onboarding should be
  an invite, not sign up"). Add an internal-only "create user" action in `src/lib/actions.ts`
  (a few lines — same pattern as `createCampaign`) when you're ready, gated to Brand
  Solutions/Campaign Manager.
- Internal logins should be restricted to your `@theboredmonkey.com` domain — add that check
  in the `authorize()` callback in `src/lib/auth.ts` for non-CLIENT roles.

## 4. Deploying

Simplest path: [Vercel](https://vercel.com) for the app (native Next.js support) + Neon or
Supabase for Postgres. Push this folder to a GitHub repo, import it in Vercel, set the same
env vars from `.env` in Vercel's dashboard, done. Railway is a good alternative if you'd
rather have app + DB in one place.

## 5. Wiring real tracking data (Phase 2 of the brief)

Start with YouTube — it's a clean official API, no unresolved questions. Then resolve
Instagram, which the brief flags as the one real unknown. Full detail with links and
trade-offs is in `src/lib/tracking.ts` — short version:

- **YouTube**: get a Data API v3 key, call `videos.list` with the video ID from the live
  link, get views/likes/comments back directly.
- **Instagram**: three legitimate options, in order of how "official" they are — creator-
  authorized Graph API, an approved data provider (Phyllo/Modash/HypeAuditor), or manual
  entry as a fallback while you decide. Do not scrape or automate a browser session against
  Instagram — that's against their terms and risks whatever account you use for it. This
  matches the caution from our conversation: use permitted integrations, not workarounds.

## 6. Wiring the Creator Intelligence / Scouting Engine

Same principle as tracking: the queue (`/creators`) and scoring logic already work end to
end with manually-imported creators. To make discovery automated, swap the manual form for a
call to an approved data provider's search API, or the Instagram Business Discovery API for
public business/creator account stats. Details and links in `src/lib/scouting.ts`. Outreach
(once a creator is promoted into a campaign) should route through a human-approved send via
email or an official messaging integration — not an automated personal-account bot.

## 7. Notifications

`src/lib/notify.ts` already writes every notification (instant + digest) to the database, so
the in-app feed works today. To also send real email: add SMTP credentials to `.env`, fill in
`src/lib/mailer.ts` (a working nodemailer example is commented in the file), and call it from
`notify()`. For the digest batching (brief slide 16 — collected FYIs sent at fixed times, not
one email per event), add a scheduled job — Vercel Cron is the simplest if you're on Vercel.

## Project structure

```
prisma/schema.prisma       Full data model — Campaign, Creator, Deliverable, NegotiationRound,
                            Remark, ActivityLog, ScoutedCreator, Notification, User, etc.
prisma/seed.ts              Demo users + one campaign at various stages
src/lib/constants.ts        Roles, stages, statuses — single source of truth for vocabulary
src/lib/rbac.ts              Who can see internal cost / approve commercial edits / etc.
src/lib/actions.ts           Every mutation in the system (server actions) — this is where
                              most of the workflow logic lives
src/lib/sla.ts                TAT/SLA helpers (go-live risk, days-since, stage ownership)
src/lib/tracking.ts           Notes + extension point for automated metric fetch
src/lib/scouting.ts           Notes + extension point for creator discovery sourcing
src/lib/mailer.ts             Extension point for real email delivery
src/app/(app)/                Every screen behind login: dashboard, campaigns, creators,
                              communications, files, reports
src/components/campaign/      Campaign workspace UI (pipeline bar, shortlist, deliverables,
                              negotiation, communications, reports)
```

## Roadmap (matches the phasing in the original brief)

- **Phase 1 — this scaffold**: campaign creation/brief, shortlisting with dual cost fields,
  client review + negotiation log, onboarding + locks, in-panel communication, audit log,
  Creator Intelligence queue with manual import. Ships the highest-value fix (kills the
  Sheets + WhatsApp workflow) without depending on any external API.
- **Phase 2 — wire the data**: YouTube tracking, resolve + wire Instagram, automate scouting
  via a data provider or Business Discovery API, real email delivery.
- **Phase 3 — reporting polish**: spotlight/top-content views, spend-band analysis, comment
  sentiment, PDF/deck export. The aggregate numbers already compute correctly in the Reports
  tab; this phase is presentation and the extra cuts (by follower band, by format).

## Open decisions (carried over from the brief, still yours to make)

Instagram data source, hosting choice, exact tracking refresh cadence, digest send times, and
what counts as a "minor" vs. commercial-approval-required edit. `src/lib/actions.ts` has a
`requestCommercialEdit` function with a comment marking where to tighten the dual-approval
flow once you've decided the threshold.
