"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

// Broad product verticals for the New Campaign form's Product Category
// field — deliberately different from CONTENT_CATEGORIES in
// PlatformBriefsEditor.tsx, which is about a creator's content niche
// (Beauty, Gaming, etc.), not what the client's actual product is. Not
// exhaustive by design — "Others" below always escapes to free text, same
// pattern as INDIAN_LANGUAGES/CONTENT_CATEGORIES/MAJOR_INDIAN_CITIES.
export const PRODUCT_CATEGORIES = [
  "Tech & Electronics",
  "Kitchen & Home Appliances",
  "Beauty & Personal Care",
  "Fashion & Apparel",
  "Health & Wellness",
  "Baby & Kids",
  "Sports & Fitness",
  "Automotive",
  "Furniture & Home Decor",
  "Food & Beverage",
  "Travel & Luggage",
  "Pets",
];

// Dropdown-with-"Others"-escape-hatch for Product Category, standalone
// form-field version of the same pattern CategoryField/LanguageField use
// inside PlatformBriefsEditor.tsx (those are table/list-row-scoped; this
// one carries its own label and full-width form styling for a plain page).
export function ProductCategoryField({ name, initial }: { name: string; initial?: string }) {
  const isKnown = !initial || PRODUCT_CATEGORIES.includes(initial);
  const [otherMode, setOtherMode] = useState(!!initial && !isKnown);
  const [value, setValue] = useState(initial ?? "");

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        Product Category <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
      </label>
      {otherMode ? (
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type the category"
            autoFocus
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={() => {
              setOtherMode(false);
              setValue("");
            }}
            className="shrink-0 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            Back
          </button>
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === "Others") {
              setOtherMode(true);
              setValue("");
            } else {
              setValue(e.target.value);
            }
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          <option value="">Select category…</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="Others">Others</option>
        </select>
      )}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

// Lets Brand Solutions paste more than one product page link when creating
// a campaign (e.g. the same product listed on the brand's own site and on a
// marketplace, or one link per SKU variant) — same client-state-plus-hidden-
// JSON-input pattern as PlatformBriefsFormField, so this still works inside
// the New Campaign page's plain server-action form.
export function ProductLinksField({ name, initial }: { name: string; initial?: string[] }) {
  const [links, setLinks] = useState<string[]>(initial && initial.length ? initial : [""]);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        Product URL <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
      </label>
      <div className="space-y-2">
        {links.map((link, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="url"
              value={link}
              onChange={(e) => {
                const next = e.target.value;
                setLinks((prev) => prev.map((l, idx) => (idx === i ? next : l)));
              }}
              placeholder="https://brand.com/product"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
            />
            {links.length > 1 && (
              <button
                type="button"
                onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
                className="shrink-0 text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400"
                title="Remove this link"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setLinks((prev) => [...prev, ""])}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>Add another link</span>
      </button>
      <input type="hidden" name={name} value={JSON.stringify(links.map((l) => l.trim()).filter(Boolean))} />
    </div>
  );
}
