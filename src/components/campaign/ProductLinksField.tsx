"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

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
