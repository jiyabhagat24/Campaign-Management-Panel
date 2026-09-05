// Reads captured Instagram profile data out of a Google Sheet, using a
// service account (no user OAuth flow, no googleapis package — just a
// signed JWT + two REST calls, kept dependency-free to match the rest of
// this codebase). See SETUP_GOOGLE_SHEETS_SYNC.md for how to get the
// service account credentials and share the sheet with it.
//
// The sheet's header row can be in any order — columns are matched by
// header name (case/spacing-insensitive), so this doesn't break if you
// reorder or add columns in the sheet later.

import { createSign } from "crypto";

// Full read/write scope — was read-only, widened so appendInstagramHandleToSheet()
// can add newly-discovered Instagram handles (see below). The service
// account also needs to be re-shared on the sheet with Editor access (it
// was previously only Viewer) — see SETUP_GOOGLE_SHEETS_SYNC.md.
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class GoogleSheetsSyncError extends Error {
  code: "NOT_CONFIGURED" | "AUTH_FAILED" | "SHEET_ERROR";
  constructor(code: GoogleSheetsSyncError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "GoogleSheetsSyncError";
  }
}

export type SheetProfileRow = {
  username: string;
  profileUrl?: string;
  contactEmail?: string;
  followers?: number;
  postsCount?: number;
  avgViews?: number;
  engagementRate?: number;
  capturedAt?: string;
};

function base64url(input: Buffer | string) {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new GoogleSheetsSyncError(
      "NOT_CONFIGURED",
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY aren't set — see SETUP_GOOGLE_SHEETS_SYNC.md."
    );
  }
  // .env stores the key as one line with literal \n escapes; restore real newlines.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claims}`;
  const signature = base64url(createSign("RSA-SHA256").update(signingInput).sign(privateKey));
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new GoogleSheetsSyncError(
      "AUTH_FAILED",
      json?.error_description ?? "Couldn't authenticate with Google — check the service account credentials."
    );
  }
  return json.access_token;
}

// Normalizes a header like "Avg. Views" or "avg_views" down to "avgviews"
// so column matching doesn't care about spacing/punctuation/case.
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES: Record<string, keyof SheetProfileRow> = {
  username: "username",
  handle: "username",
  instagramhandle: "username",
  ighandle: "username",
  profileurl: "profileUrl",
  url: "profileUrl",
  link: "profileUrl",
  email: "contactEmail",
  emailid: "contactEmail",
  contactemail: "contactEmail",
  businessemail: "contactEmail",
  followers: "followers",
  followercount: "followers",
  posts: "postsCount",
  postcount: "postsCount",
  postscount: "postsCount",
  mediacount: "postsCount",
  avgviews: "avgViews",
  averageviews: "avgViews",
  avgviewcount: "avgViews",
  engagement: "engagementRate",
  engagementrate: "engagementRate",
  engagementpercent: "engagementRate",
  engagementpct: "engagementRate",
  capturedat: "capturedAt",
  captureddate: "capturedAt",
  datecaptured: "capturedAt",
  scrapedat: "capturedAt",
  timestamp: "capturedAt",
};

const NUMERIC_FIELDS = new Set<keyof SheetProfileRow>([
  "followers",
  "postsCount",
  "avgViews",
  "engagementRate",
]);

function parseNumeric(raw: string): number | undefined {
  const cleaned = raw.replace(/[,%\s]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

// The URL bar's ?gid=123 identifies a tab by its numeric internal ID, but
// the values.get API needs the tab's actual NAME. Resolves that once via
// the spreadsheet's metadata so users can just paste the gid from the URL
// instead of having to go find/type the tab name themselves.
async function resolveTabNameFromGid(spreadsheetId: string, gid: string, accessToken: string): Promise<string> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new GoogleSheetsSyncError(
      "SHEET_ERROR",
      json?.error?.message ?? "Couldn't read the spreadsheet's tab list — check GOOGLE_SHEETS_ID and sharing."
    );
  }
  const sheets: Array<{ properties: { sheetId: number; title: string } }> = json.sheets ?? [];
  const match = sheets.find((s) => String(s.properties.sheetId) === gid);
  if (!match) {
    throw new GoogleSheetsSyncError(
      "SHEET_ERROR",
      `No tab with gid=${gid} found in this spreadsheet. Tabs available: ${sheets.map((s) => s.properties.title).join(", ")}.`
    );
  }
  return match.properties.title;
}

export async function fetchInstagramRowsFromSheet(): Promise<SheetProfileRow[]> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const rangeSetting = (process.env.GOOGLE_SHEETS_RANGE || "Sheet1").trim();
  if (!spreadsheetId) {
    throw new GoogleSheetsSyncError("NOT_CONFIGURED", "GOOGLE_SHEETS_ID isn't set — see SETUP_GOOGLE_SHEETS_SYNC.md.");
  }

  const accessToken = await getAccessToken();

  // If GOOGLE_SHEETS_RANGE is just digits, treat it as a gid (from the
  // ...#gid=123456 in the sheet's URL) and resolve the real tab name first.
  const range = /^\d+$/.test(rangeSetting)
    ? await resolveTabNameFromGid(spreadsheetId, rangeSetting, accessToken)
    : rangeSetting;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json) {
    throw new GoogleSheetsSyncError(
      "SHEET_ERROR",
      json?.error?.message ?? "Couldn't read the sheet — check GOOGLE_SHEETS_ID/GOOGLE_SHEETS_RANGE and that the sheet is shared with the service account."
    );
  }

  const rows: string[][] = json.values ?? [];
  if (rows.length < 2) return []; // header row only, or empty

  const [headerRow, ...dataRows] = rows;
  const columnMap: Array<keyof SheetProfileRow | null> = headerRow.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? null);

  const usernameColIndex = columnMap.indexOf("username");
  if (usernameColIndex === -1) {
    throw new GoogleSheetsSyncError(
      "SHEET_ERROR",
      `Couldn't find a "username"/"handle" column in the sheet's header row (${headerRow.join(", ")}).`
    );
  }

  const results: SheetProfileRow[] = [];
  for (const row of dataRows) {
    const record: Partial<SheetProfileRow> = {};
    columnMap.forEach((field, i) => {
      if (!field) return;
      const raw = (row[i] ?? "").trim();
      if (!raw) return;
      if (NUMERIC_FIELDS.has(field)) {
        const num = parseNumeric(raw);
        if (num !== undefined) (record as any)[field] = num;
      } else {
        (record as any)[field] = raw;
      }
    });
    if (record.username) results.push(record as SheetProfileRow);
  }
  return results;
}

// Adds a newly-discovered Instagram handle as a new row in the same sheet
// (in whichever column the header row maps to "username"), so it flows into
// the existing sync pipeline and eventually gets real stats once someone
// captures that profile with the extension. Best-effort: returns false
// instead of throwing on any failure — a YouTube creator's Instagram handle
// is a bonus find, discovery/adding a creator shouldn't fail because of it.
export async function appendInstagramHandleToSheet(username: string): Promise<boolean> {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    const rangeSetting = (process.env.GOOGLE_SHEETS_RANGE || "Sheet1").trim();
    if (!spreadsheetId) return false;

    const accessToken = await getAccessToken();
    const range = /^\d+$/.test(rangeSetting)
      ? await resolveTabNameFromGid(spreadsheetId, rangeSetting, accessToken)
      : rangeSetting;

    // Re-read the header row (via the same values.get this file already
    // uses for the sync job) so the handle lands in the right column no
    // matter how the sheet's columns are ordered.
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
    const readRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const readJson = await readRes.json().catch(() => null);
    if (!readRes.ok || !readJson) return false;

    const headerRow: string[] = readJson.values?.[0] ?? [];
    const columnMap = headerRow.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? null);
    const usernameColIndex = columnMap.indexOf("username");
    if (usernameColIndex === -1) return false;

    // Skip if this handle is already in the sheet — avoid piling up
    // duplicate rows every time the same creator gets rediscovered.
    const existingUsernames = new Set(
      (readJson.values ?? []).slice(1).map((row: string[]) => (row[usernameColIndex] ?? "").trim().toLowerCase())
    );
    if (existingUsernames.has(username.trim().toLowerCase())) return true;

    const newRow = new Array(headerRow.length).fill("");
    newRow[usernameColIndex] = username;

    // Also fill the profile URL column, if the sheet has one — so the row
    // isn't just a bare username with everything else blank.
    const profileUrlColIndex = columnMap.indexOf("profileUrl");
    if (profileUrlColIndex !== -1) {
      newRow[profileUrlColIndex] = `https://www.instagram.com/${username}/`;
    }

    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const appendRes = await fetch(appendUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [newRow] }),
    });
    return appendRes.ok;
  } catch {
    return false;
  }
}
