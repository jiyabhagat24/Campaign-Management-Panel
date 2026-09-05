import { NextRequest, NextResponse } from "next/server";
import { upsertInstagramProfile } from "@/lib/instagramCache";

// Your browser extension calls this whenever it captures an Instagram
// profile you've manually browsed to — saves/updates one row per username in
// InstagramProfileCache. The "paste URL" auto-fill in the Add Influencer
// form reads from this table first, before falling back to the free
// Instagram Graph API.
//
// Auth: a shared secret in the x-api-key header, checked against
// EXTENSION_API_KEY in .env. This is not a user login — it's a machine
// credential for your own extension, so keep it out of any client-side code
// and don't commit it.
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = process.env.EXTENSION_API_KEY;

  if (!expectedKey) {
    return NextResponse.json(
      { error: "EXTENSION_API_KEY isn't set on the server yet — add it to .env and restart." },
      { status: 503 }
    );
  }
  if (apiKey !== expectedKey) {
    return NextResponse.json({ error: "Invalid or missing x-api-key." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });

  const rawUsername = String(body.username ?? body.profileUrl ?? "").trim();
  if (!rawUsername) {
    return NextResponse.json({ error: "'username' (or 'profileUrl') is required." }, { status: 400 });
  }

  try {
    const saved = await upsertInstagramProfile({ ...body, username: rawUsername });
    return NextResponse.json({ ok: true, username: saved.username, updatedAt: saved.updatedAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save." }, { status: 500 });
  }
}
