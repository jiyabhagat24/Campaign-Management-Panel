"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import MultiSelectBox from "./MultiSelectBox";

// One campaign can run a completely different brief per platform — e.g.
// Atomberg's Instagram brief (Lifestyle/Comic, 1 Collab Reel + 1 MUR,
// ₹60-70K/creator, 6 languages) is nothing like its YouTube brief (Tech,
// Dedicated Video + Short, ₹80K max, 5 languages). Tick which platforms
// this campaign runs on up top; each ticked platform gets its own brief
// block below (category / deliverables / budget-per-creator / languages).
export const PLATFORM_OPTIONS = ["Instagram", "YouTube"];

// Major Indian languages content creators are typically briefed in —
// covers the big regional ones plus English/Hindi. Not exhaustive by
// design (there's no free-text escape hatch here, only what's listed).
export const INDIAN_LANGUAGES = [
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Malayalam",
  "Kannada",
  "Marathi",
  "Bengali",
  "Gujarati",
  "Punjabi",
  "Odia",
  "Assamese",
  "Urdu",
  "Bhojpuri",
  "Rajasthani",
  "Haryanvi",
];

// Common content categories for shortlisting creators — CategoryField below
// also takes free text for anything not listed here.
export const CONTENT_CATEGORIES = [
  "Beauty",
  "Fashion",
  "Lifestyle",
  "Tech",
  "Gadgets",
  "Food",
  "Travel",
  "Fitness",
  "Comedy / Entertainment",
  "Finance",
  "Education",
  "Parenting / Family",
  "Gaming",
  "Automobile",
  "Health & Wellness",
  "Home & Decor",
  "Sports",
  "Music / Dance",
  "Vlogging",
  "Business / Startup",
];

// Major Indian cities a creator is typically based in — used by the
// per-creator Location combobox on the Shortlist/Onboarding tables
// (CreatorKanban.tsx), not by this campaign-brief editor itself. Kept here
// alongside INDIAN_LANGUAGES/CONTENT_CATEGORIES since it's the same
// combobox-plus-free-text shape and those two already live in this file.
// Not exhaustive by design, same reasoning as the language list.
export const MAJOR_INDIAN_CITIES = [
  "Mumbai",
  "Delhi",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Surat",
  "Lucknow",
  "Chandigarh",
  "Kochi",
  "Indore",
  "Bhopal",
  "Nagpur",
  "Coimbatore",
  "Goa",
];

export type PlatformBriefValue = {
  platform: string;
  category: string;
  deliverables: string;
  budgetPerCreatorMin: string;
  budgetPerCreatorMax: string;
  languageRequirements: { language: string; creatorsRequired: string }[];
};

const emptyLanguageRows = () => [
  { language: "", creatorsRequired: "" },
  { language: "", creatorsRequired: "" },
];

export const emptyPlatformBrief = (platform: string): PlatformBriefValue => ({
  platform,
  category: "",
  deliverables: "",
  budgetPerCreatorMin: "",
  budgetPerCreatorMax: "",
  languageRequirements: emptyLanguageRows(),
});

// Category dropdown, native multi-select (ctrl/cmd-click to pick more than
// one) — `value` is a comma-separated string (same storage shape SkuField
// uses). A campaign's Instagram brief is rarely just one category (e.g.
// "Beauty, Lifestyle").
function CategoryField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Category</label>
      <MultiSelectBox
        options={CONTENT_CATEGORIES}
        value={value}
        onChange={onChange}
        placeholder="Select categories…"
        className="w-full truncate rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
      />
    </div>
  );
}

// Instagram deliverables are counted (how many Reels/Posts/Carousels/
// Stories), plus a yes/no repost tickbox. YouTube deliverables are all
// yes/no deliverable types (no quantities) — a campaign either includes a
// Dedicated video or it doesn't. Two different shapes, so DeliverablesField
// below branches on platform rather than sharing one layout.
const INSTA_QTY_TYPES: { key: "reel" | "post" | "carousel" | "story"; label: string }[] = [
  { key: "reel", label: "Reel" },
  { key: "post", label: "Post" },
  { key: "carousel", label: "Carousel" },
  { key: "story", label: "Story" },
];

const YT_TICK_TYPES: { key: "ytShorts" | "ytDedicated" | "ytConceptual" | "ytIntegrated" | "instaReelRepost"; label: string }[] = [
  { key: "ytShorts", label: "YT Shorts" },
  { key: "ytDedicated", label: "YT Dedicated" },
  { key: "ytConceptual", label: "YT Conceptual" },
  { key: "ytIntegrated", label: "YT Integrated" },
  { key: "instaReelRepost", label: "Insta Reel Repost" },
];

// Best-effort re-parse of a previously saved plain-text deliverables string
// (e.g. "Reel x3, Post x1 + YT Shorts Repost") back into the structured
// checkbox/quantity state, so editing an existing brief doesn't blank the
// form out. Anything it can't recognize (old free-text briefs written
// before this field existed, e.g. "1 Collab Reel + 1 Month Usage Rights")
// falls through to the "Other" box untouched — no data loss either way.
function parseInstaDeliverables(raw: string) {
  let rest = raw;
  const qty: Record<string, string> = {};
  for (const { key, label } of INSTA_QTY_TYPES) {
    const re = new RegExp(`${label}s?\\s*x?\\s*(\\d+)`, "i");
    const m = rest.match(re);
    if (m) {
      qty[key] = m[1];
      rest = rest.replace(m[0], "");
    }
  }
  const ytShortsRepost = /YT\s+Shorts\s+Repost/i.test(rest);
  rest = rest.replace(/YT\s+Shorts\s+Repost/i, "");
  const other = rest.replace(/^[\s,+|;-]+|[\s,+|;-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return { qty, ytShortsRepost, other };
}

function parseYtDeliverables(raw: string) {
  let rest = raw;
  const ticks: Record<string, boolean> = {};
  for (const { key, label } of YT_TICK_TYPES) {
    const re = new RegExp(label.replace(/\s+/g, "\\s+"), "i");
    if (re.test(rest)) {
      ticks[key] = true;
      rest = rest.replace(re, "");
    }
  }
  const other = rest.replace(/^[\s,+|;-]+|[\s,+|;-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return { ticks, other };
}

// Structured, platform-specific deliverables checklist — replaces the old
// single free-text "Deliverables" input. Still serializes down to the same
// plain string CampaignPlatformBrief.deliverables stores (e.g. "Reel x3,
// Post x1 + YT Shorts Repost"), so no schema change is needed — same
// "rich UI, flat string storage" pattern SkuField uses on the New Campaign
// form.
function DeliverablesField({ platform, value, onChange }: { platform: string; value: string; onChange: (v: string) => void }) {
  const isInsta = platform === "Instagram";
  const instaParsed = parseInstaDeliverables(value);
  const ytParsed = parseYtDeliverables(value);

  const [instaQty, setInstaQty] = useState<Record<string, string>>(instaParsed.qty);
  const [ytShortsRepost, setYtShortsRepost] = useState(instaParsed.ytShortsRepost);
  const [ytTicks, setYtTicks] = useState<Record<string, boolean>>(ytParsed.ticks);
  const [other, setOther] = useState(isInsta ? instaParsed.other : ytParsed.other);

  function serialize(nextInstaQty: Record<string, string>, nextYtShortsRepost: boolean, nextYtTicks: Record<string, boolean>, nextOther: string) {
    const parts: string[] = [];
    if (isInsta) {
      const qtyParts = INSTA_QTY_TYPES.filter(({ key }) => parseInt(nextInstaQty[key] ?? "0", 10) > 0).map(
        ({ key, label }) => `${label} x${nextInstaQty[key]}`
      );
      if (qtyParts.length) parts.push(qtyParts.join(", "));
      if (nextYtShortsRepost) parts.push("YT Shorts Repost");
    } else {
      const tickParts = YT_TICK_TYPES.filter(({ key }) => nextYtTicks[key]).map(({ label }) => label);
      if (tickParts.length) parts.push(tickParts.join(", "));
    }
    if (nextOther.trim()) parts.push(nextOther.trim());
    return parts.join(" + ");
  }

  function updateInstaQty(key: string, v: string) {
    const digits = v.replace(/[^\d]/g, "");
    const next = { ...instaQty, [key]: digits };
    setInstaQty(next);
    onChange(serialize(next, ytShortsRepost, ytTicks, other));
  }

  function updateYtShortsRepost(checked: boolean) {
    setYtShortsRepost(checked);
    onChange(serialize(instaQty, checked, ytTicks, other));
  }

  function updateYtTick(key: string, checked: boolean) {
    const next = { ...ytTicks, [key]: checked };
    setYtTicks(next);
    onChange(serialize(instaQty, ytShortsRepost, next, other));
  }

  function updateOther(v: string) {
    setOther(v);
    onChange(serialize(instaQty, ytShortsRepost, ytTicks, v));
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Deliverables</label>
      {isInsta ? (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {INSTA_QTY_TYPES.map(({ key, label }) => (
              <div key={key}>
                <label className="mb-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{label}</label>
                <input
                  value={instaQty[key] ?? ""}
                  onChange={(e) => updateInstaQty(key, e.target.value)}
                  placeholder="0"
                  inputMode="numeric"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
                />
              </div>
            ))}
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={ytShortsRepost}
              onChange={(e) => updateYtShortsRepost(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            YT Shorts Repost
          </label>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {YT_TICK_TYPES.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(ytTicks[key])}
                onChange={(e) => updateYtTick(key, e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              {label}
            </label>
          ))}
        </div>
      )}
      <input
        value={other}
        onChange={(e) => updateOther(e.target.value)}
        placeholder="Other deliverable notes (optional)"
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
      />
    </div>
  );
}

// Same combobox pattern as CategoryField, for one language row.
function LanguageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const listId = useId();
  return (
    <div className="flex-1">
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Select or type a language"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
      />
      <datalist id={listId}>
        {INDIAN_LANGUAGES.map((lang) => (
          <option key={lang} value={lang} />
        ))}
      </datalist>
    </div>
  );
}

// Controlled — the caller owns the array of platform briefs. Used directly
// by CampaignHeaderEditor (already a client component managing its own
// state); wrapped by PlatformBriefsFormField below for use inside a plain
// server-action <form>.
export default function PlatformBriefsEditor({
  value,
  onChange,
}: {
  value: PlatformBriefValue[];
  onChange: (next: PlatformBriefValue[]) => void;
}) {
  const selectedPlatforms = new Set(value.map((v) => v.platform));

  function togglePlatform(platform: string, checked: boolean) {
    if (checked) {
      onChange([...value, emptyPlatformBrief(platform)]);
    } else {
      onChange(value.filter((v) => v.platform !== platform));
    }
  }

  function updateBrief(platform: string, patch: Partial<PlatformBriefValue>) {
    onChange(value.map((v) => (v.platform === platform ? { ...v, ...patch } : v)));
  }

  function updateLangRow(platform: string, index: number, patch: Partial<{ language: string; creatorsRequired: string }>) {
    onChange(
      value.map((v) =>
        v.platform !== platform
          ? v
          : { ...v, languageRequirements: v.languageRequirements.map((r, i) => (i === index ? { ...r, ...patch } : r)) }
      )
    );
  }

  function addLangRow(platform: string) {
    onChange(
      value.map((v) => (v.platform !== platform ? v : { ...v, languageRequirements: [...v.languageRequirements, { language: "", creatorsRequired: "" }] }))
    );
  }

  function removeLangRow(platform: string, index: number) {
    onChange(
      value.map((v) =>
        v.platform !== platform || v.languageRequirements.length <= 1
          ? v
          : { ...v, languageRequirements: v.languageRequirements.filter((_, i) => i !== index) }
      )
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Platforms</label>
        <div className="flex flex-wrap gap-3">
          {PLATFORM_OPTIONS.map((platform) => (
            <label
              key={platform}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                selectedPlatforms.has(platform)
                  ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"
                  : "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedPlatforms.has(platform)}
                onChange={(e) => togglePlatform(platform, e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              {platform}
            </label>
          ))}
        </div>
      </div>

      {value.map((brief) => (
        <div
          key={brief.platform}
          className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{brief.platform} brief</p>

          <CategoryField value={brief.category} onChange={(v) => updateBrief(brief.platform, { category: v })} />
          <DeliverablesField
            platform={brief.platform}
            value={brief.deliverables}
            onChange={(v) => updateBrief(brief.platform, { deliverables: v })}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Budget per creator — min (₹)</label>
              <input
                value={brief.budgetPerCreatorMin}
                onChange={(e) => updateBrief(brief.platform, { budgetPerCreatorMin: e.target.value })}
                type="number"
                placeholder="Optional"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Budget per creator — max (₹)</label>
              <input
                value={brief.budgetPerCreatorMax}
                onChange={(e) => updateBrief(brief.platform, { budgetPerCreatorMax: e.target.value })}
                type="number"
                placeholder="e.g. 70000"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Language-wise requirement</label>
              {(() => {
                const total = brief.languageRequirements.reduce((s, r) => s + (parseInt(r.creatorsRequired, 10) || 0), 0);
                return total > 0 ? (
                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                    Total: {total} creator{total === 1 ? "" : "s"}
                  </span>
                ) : null;
              })()}
            </div>
            <div className="space-y-2">
              {brief.languageRequirements.map((row, i) => (
                <div key={i} className="flex items-start gap-2">
                  <LanguageField
                    value={row.language}
                    onChange={(v) => updateLangRow(brief.platform, i, { language: v })}
                  />
                  <input
                    value={row.creatorsRequired}
                    onChange={(e) => updateLangRow(brief.platform, i, { creatorsRequired: e.target.value.replace(/[^\d]/g, "") })}
                    placeholder="Creators"
                    inputMode="numeric"
                    className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeLangRow(brief.platform, i)}
                    disabled={brief.languageRequirements.length === 1}
                    title="Remove row"
                    className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-600 dark:hover:bg-rose-950/40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => addLangRow(brief.platform)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <Plus className="h-3.5 w-3.5" />
              Add language
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Drop-in for a plain server-action <form>: keeps its own state, and mirrors
// it into a hidden JSON input the server action reads via
// formData.get(name) — see parsePlatformBriefsJson in actions.ts.
export function PlatformBriefsFormField({ name, initial }: { name: string; initial?: PlatformBriefValue[] }) {
  const [value, setValue] = useState<PlatformBriefValue[]>(initial ?? []);
  return (
    <>
      <PlatformBriefsEditor value={value} onChange={setValue} />
      <input type="hidden" name={name} value={JSON.stringify(value)} />
    </>
  );
}
