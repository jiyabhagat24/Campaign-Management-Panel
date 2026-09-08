"use client";

import { useState, useTransition } from "react";
import { updateCampaignInvoiced } from "@/lib/actions";

// Section B of the "Finance and Invoicing (TheBoredMonkey eyes only)" sheet
// spec — money in from the client. Deliberately just Client / Campaign /
// Final Closed Cost / Invoiced (Yes/No) — "that is all the client side
// needs here," per the sheet.
export type ClientInvoicingRow = {
  id: string;
  brand: string;
  name: string;
  finalClosedCost: number | null;
  invoiced: boolean;
};

const money = (n: number | null) => (n ? `₹${n.toLocaleString("en-IN")}` : "—");

function InvoicedRow({ row }: { row: ClientInvoicingRow }) {
  const [invoiced, setInvoiced] = useState(row.invoiced);
  const [, startTransition] = useTransition();

  return (
    <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
      <td className="border-b border-slate-100 px-4 py-3 text-left font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
        {row.brand}
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-600 dark:border-slate-800 dark:text-slate-300">
        {row.name}
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
        {money(row.finalClosedCost)}
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800">
        <select
          value={invoiced ? "yes" : "no"}
          onChange={(e) => {
            const v = e.target.value === "yes";
            setInvoiced(v);
            startTransition(() => {
              updateCampaignInvoiced(row.id, v).catch(() => setInvoiced(!v));
            });
          }}
          className={`rounded-lg border px-2 py-1 text-xs font-bold outline-none disabled:opacity-50 ${
            invoiced
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          <option value="no">Not invoiced</option>
          <option value="yes">Invoiced</option>
        </select>
      </td>
    </tr>
  );
}

export default function ClientInvoicingTable({ rows }: { rows: ClientInvoicingRow[] }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Client</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Campaign</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Final Closed Cost</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Invoiced</th>
            </tr>
          </thead>
          <tbody className="font-medium">
            {rows.map((r) => (
              <InvoicedRow key={r.id} row={r} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-slate-400 dark:text-slate-500">
                  No campaigns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
