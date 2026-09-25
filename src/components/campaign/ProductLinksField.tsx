"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";

// Broad product verticals for the New Campaign form's Product Category
// field — deliberately different from CONTENT_CATEGORIES in
// PlatformBriefsEditor.tsx, which is about a creator's content niche
// (Beauty, Gaming, etc.), not what the client's actual product is. Not
// exhaustive by design — typing anything not listed here just works, same
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

// Combobox (native input+datalist) for Product Category — one box you can
// either pick a suggestion from or type straight into, rather than a select
// that swaps out for a separate "Others" text box. Same pattern as
// CategoryField/LanguageField in PlatformBriefsEditor.tsx (those are
// table/list-row-scoped; this one carries its own label and full-width form
// styling for a plain page).
export function ProductCategoryField({ name, initial }: { name: string; initial?: string }) {
  const listId = useId();
  const [value, setValue] = useState(initial ?? "");

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Product Category</label>
      <input
        list={listId}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Select or type a category"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
      />
      <datalist id={listId}>
        {PRODUCT_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}

type SkuGroup = { name: string; types: string[] };

// Numbered SKU groups (e.g. "1. MacBook"), each with its own add/remove list
// of sub-types (Mac Pro, Mac Air, Mac Neo) — two-level version of the same
// add/remove-box pattern ProductLinksField uses below. Still joins down to a
// single free-text string on submit since `sku` in schema.prisma is just a
// String? column: "MacBook: Mac Pro, Mac Air, Mac Neo; iPhone: 15, 16".
export function SkuField({ name, initial }: { name: string; initial?: SkuGroup[] }) {
  const [groups, setGroups] = useState<SkuGroup[]>(initial && initial.length ? initial : [{ name: "", types: [""] }]);

  function updateGroup(i: number, patch: Partial<SkuGroup>) {
    setGroups((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }

  const serialized = groups
    .map((g) => {
      const gName = g.name.trim();
      if (!gName) return "";
      const types = g.types.map((t) => t.trim()).filter(Boolean);
      return types.length ? `${gName}: ${types.join(", ")}` : gName;
    })
    .filter(Boolean)
    .join("; ");

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">SKU</label>
      <div className="space-y-3">
        {groups.map((group, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-slate-500 dark:text-slate-400">{i + 1}.</span>
              <input
                value={group.name}
                onChange={(e) => updateGroup(i, { name: e.target.value })}
                placeholder="e.g. MacBook"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
              {groups.length > 1 && (
                <button
                  type="button"
                  onClick={() => setGroups((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400"
                  title="Remove this SKU"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-2 ml-6 space-y-2">
              {group.types.map((type, j) => (
                <div key={j} className="flex items-center gap-2">
                  <input
                    value={type}
                    onChange={(e) => {
                      const next = e.target.value;
                      updateGroup(i, { types: group.types.map((t, idx) => (idx === j ? next : t)) });
                    }}
                    placeholder="e.g. Mac Air"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
                  />
                  {group.types.length > 1 && (
                    <button
                      type="button"
                      onClick={() => updateGroup(i, { types: group.types.filter((_, idx) => idx !== j) })}
                      className="shrink-0 text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400"
                      title="Remove this type"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateGroup(i, { types: [...group.types, ""] })}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add another type</span>
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setGroups((prev) => [...prev, { name: "", types: [""] }])}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>Add another SKU</span>
      </button>
      <input type="hidden" name={name} value={serialized} />
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
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Product URL</label>
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
