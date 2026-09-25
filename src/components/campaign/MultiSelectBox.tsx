"use client";

import { useEffect, useRef, useState } from "react";

// Looks like a plain text box; click it to open a checkbox dropdown, pick
// as many options as you like, and the box itself shows them comma-
// separated — used everywhere a "Category" field needs more than one pick
// (Product Category, platform-brief Category, per-creator Category cell).
// Storage stays a single comma-separated string, same shape SkuField uses.
export default function MultiSelectBox({
  options,
  value,
  onChange,
  placeholder,
  className,
  name,
}: {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  className: string;
  name?: string; // set to also submit as a plain <form> field via a hidden input
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle(opt: string) {
    const next = selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt];
    onChange(next.join(", "));
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} title={value} className={className}>
        {value || placeholder}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {options.map((o) => (
            <label
              key={o}
              className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={() => toggle(o)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              {o}
            </label>
          ))}
        </div>
      )}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
