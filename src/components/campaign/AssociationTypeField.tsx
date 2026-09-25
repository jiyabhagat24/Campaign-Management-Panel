"use client";

import { useState } from "react";
import { ASSOCIATION_TYPES, ASSOCIATION_TYPE_LABELS, type AssociationType } from "@/lib/constants";

// Project Basis -> a % input (associationPercent), Retainer Basis -> a flat
// ₹ amount input (associationRetainerAmount) — one at a time, same
// toggle-the-second-field pattern FinanceRow.tsx uses for its (separate,
// internal-cost) Fee type.
export default function AssociationTypeField() {
  const [type, setType] = useState<AssociationType>("PROJECT");

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Association Type</label>
      <select
        name="associationType"
        value={type}
        onChange={(e) => setType(e.target.value as AssociationType)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
      >
        {ASSOCIATION_TYPES.map((t) => (
          <option key={t} value={t}>
            {ASSOCIATION_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      {type === "RETAINER" ? (
        <input
          name="associationRetainerAmount"
          type="number"
          step="0.01"
          placeholder="Amount (₹)"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
        />
      ) : (
        <input
          name="associationPercent"
          type="number"
          step="0.01"
          placeholder="Percentage (%)"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
        />
      )}
    </div>
  );
}
