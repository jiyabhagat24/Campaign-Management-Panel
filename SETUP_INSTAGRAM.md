# Setting up Instagram auto-fill (free, official)

This connects the "Add Influencer" form's auto-fill (paste an Instagram
profile URL → followers + engagement % fill in automatically) to Meta's
**Instagram Graph API — Business Discovery** endpoint. This is the only free,
official way to pull public profile stats for someone else's account.

**Before you start, know the limits:**
- Only works for Instagram accounts set up as **Business or Creator**
  (most influencers are — personal accounts return nothing, that's a Meta
  restriction, not a bug here).
- Gives you followers count and an engagement rate calculated from the
  account's recent posts' likes/comments. It does **not** give "avg views" —
  Meta only exposes video/reel view counts to the account owner, so that
  field stays manual in the form.
- No audience demographics or fake-follower detection (that's what paid
  providers like Modash/HypeAuditor sell on top of this).

## Steps

1. **Make sure you (TheBoredMonkey) have an Instagram Business or Creator
   account**, connected to a Facebook Page. This is the account that "does
   the looking up" — the account you're looking up (the influencer) needs to
   be Business/Creator too, but doesn't need to be connected to anything of
   yours.
   - Instagram app → Settings → Account type → switch to Professional
     Account → Business (if not already).
   - Settings → Linked accounts → Facebook → connect it to a Facebook Page
     you control (create a free Page if you don't have one).

2. **Create a Meta App** at [developers.facebook.com/apps](https://developers.facebook.com/apps):
   - "Create App" → choose type **Business**.
   - Once created, add the **Instagram Graph API** product to the app
     (App Dashboard → Add Product → Instagram Graph API).

3. **Get a User Access Token** with the right permissions:
   - App Dashboard → Tools → Graph API Explorer.
   - Select your app, select your Facebook user, and request these
     permissions: `instagram_basic`, `pages_show_list`, `business_management`.
   - Click "Generate Access Token" and log in / approve.
   - This short-lived token works for testing immediately.

4. **Exchange it for a long-lived token** (lasts ~60 days, renewable) so you
   don't have to redo step 3 constantly:
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={your-app-id}
     &client_secret={your-app-secret}
     &fb_exchange_token={short-lived-token-from-step-3}
   ```
   Run that as a browser URL or via curl — the response's `access_token` is
   what goes into `INSTAGRAM_ACCESS_TOKEN`.

5. **Find your Instagram Business Account ID:**
   ```
   GET https://graph.facebook.com/v21.0/me/accounts?access_token={your-long-lived-token}
   ```
   This lists your Facebook Pages — grab the `id` of the Page connected to
   your Instagram account, then:
   ```
   GET https://graph.facebook.com/v21.0/{page-id}?fields=instagram_business_account&access_token={your-long-lived-token}
   ```
   The `instagram_business_account.id` in the response is your
   `INSTAGRAM_BUSINESS_ACCOUNT_ID`.

6. **Add both to `.env`:**
   ```
   INSTAGRAM_ACCESS_TOKEN="your-long-lived-token"
   INSTAGRAM_BUSINESS_ACCOUNT_ID="your-ig-business-account-id"
   ```
   Restart `npm run dev` after editing `.env` (env vars are only read on
   server start).

7. **Test it:** open a campaign → Shortlist tab → "+ Add Influencer to
   Shortlist" → paste any public Instagram Business/Creator profile URL into
   "Profile URL" and tab away. Followers and engagement % should fill in
   within a couple seconds.

## Token expiry

Long-lived tokens expire after ~60 days. When auto-fill starts failing with
a "rate limited" or "API error" message, regenerate one via steps 3–4 and
update `.env`. If this becomes a hassle, look into System User tokens
(Meta Business Suite → Business Settings → System Users) which don't expire
on the same cycle — worth setting up once you're relying on this daily.
