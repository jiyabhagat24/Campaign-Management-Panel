"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";

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

// Category combobox (native input+datalist) — one box to pick a suggestion
// from or type straight into, instead of a select that swaps out for a
// separate free-text box.
function CategoryField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const listId = useId();
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Category</label>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Select or type a category"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
      />
      <datalist id={listId}>
        {CONTENT_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
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

          <div className="grid grid-cols-2 gap-3">
            <CategoryField value={brief.category} onChange={(v) => updateBrief(brief.platform, { category: v })} />
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Deliverables</label>
              <input
                value={brief.deliverables}
                onChange={(e) => updateBrief(brief.platform, { deliverables: e.target.value })}
                placeholder="e.g. 1 Collab Reel + 1 Month Usage Rights"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

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
