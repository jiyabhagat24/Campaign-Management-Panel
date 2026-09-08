"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

// Repeatable "Language – N Creators" rows, matching how briefs actually
// list requirements (Hindi – 4 Creators, Tamil – 3 Creators, ...). Renders
// plain named inputs (language[] / creatorsRequired[]) so the parent
// <form>'s server action can read them with formData.getAll — no extra
// client-server plumbing needed beyond this being a client component for
// the add/remove interactivity itself.
type Row = { key: number; language: string; count: string };

let nextKey = 0;
const newRow = (): Row => ({ key: nextKey++, language: "", count: "" });

export default function LanguageRequirementRows() {
  const [rows, setRows] = useState<Row[]>([newRow(), newRow()]);

  const total = rows.reduce((sum, r) => sum + (parseInt(r.count, 10) || 0), 0);

  function update(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function remove(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Language-wise requirement
        </label>
        {total > 0 && (
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            Total: {total} creator{total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <input
              name="language"
              value={r.language}
              onChange={(e) => update(r.key, { language: e.target.value })}
              placeholder="Language, e.g. Hindi"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
            />
            <input
              name="creatorsRequired"
              value={r.count}
              onChange={(e) => update(r.key, { count: e.target.value.replace(/[^\d]/g, "") })}
              placeholder="Creators"
              inputMode="numeric"
              className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => remove(r.key)}
              disabled={rows.length === 1}
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
        onClick={() => setRows((prev) => [...prev, newRow()])}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
      >
        <Plus className="h-3.5 w-3.5" />
        Add language
      </button>
    </div>
  );
}
