// Creator Intelligence Engine — discovery source notes.
//
// The scouting queue (ScoutedCreator model, /creators page) is intentionally
// source-agnostic: addScoutedCreator() in actions.ts accepts a creator record
// regardless of where it came from. Three legitimate ways to populate it:
//
// 1. Manual import (implemented): IR adds a creator by handle; this is the
//    default until an automated source is wired in.
//
// 2. Approved data provider (recommended for automated discovery): services
//    like Phyllo, Modash, or HypeAuditor expose search/filter APIs (by niche,
//    follower band, engagement, location) under a commercial agreement, and
//    are the standard way ad agencies do creator discovery at scale without
//    touching Instagram's own systems directly. Swap the manual form for a
//    fetch to the provider's search endpoint, map results into
//    ScoutedCreator rows, and store `source: "DATA_PROVIDER"`.
//
// 3. Official Instagram Graph API (business discovery): if you have a
//    Facebook/Instagram Business app, the Business Discovery API lets you
//    look up *public* profile-level stats (followers, media count, engagement
//    on public posts) for business/creator accounts by username, without
//    needing that creator to authorize your app. This is the "official API"
//    route for read-only discovery and is worth checking against your use
//    case: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/business-discovery
//
// Explicitly out of scope, on purpose: creating placeholder/farmed Instagram
// accounts to scrape or automate discovery/outreach, or engineering activity
// patterns to evade Instagram's automation detection. That path violates
// platform terms and puts any account (and everything built on it) at risk
// of being banned. Use (2) or (3) above, or manual import, instead.
//
// Outreach (next step after promotion into a campaign): once a creator is
// promoted into a campaign shortlist, treat outreach the same way — generate
// a pitch (can be AI-assisted), route it through a human-approved send via
// email or an official messaging API/integration your team controls, and log
// responses back onto the creator's remarks/negotiation timeline in this same
// panel. No separate system, and no automated messaging that impersonates a
// personal account.

export {};
