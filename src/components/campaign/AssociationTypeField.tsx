"use client";

import { useState } from "react";
import { FEE_TYPES, ASSOCIATION_TYPE_LABELS, type FeeType } from "@/lib/constants";

// "Association Type" on the New Campaign form is the same field as Fee
// type/Agency Fee on the Finance tab (FinanceRow.tsx) — not a separate
// concept, just a different label set for the same PERCENTAGE/RETAINER
// value, entered once here instead of later. Project Basis -> a % input
// (financeAgencyFeePercent), Retainer Basis -> a flat ₹ amount input
// (financeRetainerFee) — one at a time, same toggle FinanceRow.tsx uses.
export default function AssociationTypeField() {
  const [type, setType] = useState<FeeType>("PERCENTAGE");

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Association Type</label>
      <select
        name="financeFeeType"
        value={type}
        onChange={(e) => setType(e.target.value as FeeType)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
      >
        {FEE_TYPES.map((t) => (
          <option key={t} value={t}>
            {ASSOCIATION_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      {type === "RETAINER" ? (
        <input
          name="financeRetainerFee"
          type="number"
          step="0.01"
          placeholder="Amount (₹)"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
        />
      ) : (
        <input
          name="financeAgencyFeePercent"
          type="number"
          step="0.01"
          placeholder="Percentage (%)"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
        />
      )}
    </div>
  );
}
