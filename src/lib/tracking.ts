// Phase 2 stub: automated metric tracking, triggered when a deliverable's
// live link is added (see addLiveLink in actions.ts) and refreshed on a
// schedule for 60-90 days after go-live (brief slide 14).
//
// Wire this up when ready:
//
// 1. YouTube (straightforward — official API):
//    - Get a YouTube Data API v3 key: https://console.cloud.google.com/apis/library/youtube.googleapis.com
//    - videos.list with part=statistics,snippet for the video ID parsed out of liveLink
//    - Returns viewCount, likeCount, commentCount directly. No auth beyond the API key.
//    - Manage quota across an account pool if you have many videos (10,000 units/day per key by default).
//
// 2. Instagram (hard flag — resolve this first, per brief slide 20):
//    Options, in order of preference:
//      a) Instagram Graph API with creator authorization (business/creator accounts
//         can grant your app access via Instagram Login / Facebook Login for Business).
//         This is the only fully "official" route and requires each creator to connect.
//      b) An approved third-party social data provider (e.g. Phyllo, Modash, HypeAuditor) —
//         commercial, but avoids needing per-creator OAuth and is usually faster to ship.
//      c) Manual entry fallback — IR executive pastes views/likes/comments periodically.
//         Slowest but zero integration risk; fine for Phase 1 while (a) or (b) is being resolved.
//    Do NOT scrape Instagram or automate a browser session against it — this violates
//    Instagram's terms and risks the account and anything built on top of it.
//
// 3. Call refreshDeliverableMetrics(deliverableId, { views, likes, comments, shares })
//    from src/lib/actions.ts once real numbers are fetched — the schema and UI already
//    expect this shape.
//
// 4. Run this on a schedule (cron, a queue worker, or a Vercel Cron Job hitting an API
//    route that iterates deliverables with status LIVE / liveDate within the last 90 days).

export {};
