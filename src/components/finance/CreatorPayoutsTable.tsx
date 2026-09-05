"use client";

import { useMemo, useState, useTransition } from "react";
import { updateCreatorPayout } from "@/lib/actions";
import { PAYOUT_PAYMENT_STATUSES, PAYOUT_PAYMENT_STATUS_LABELS, type PayoutPaymentStatus } from "@/lib/constants";

// Section A of the "Finance and Invoicing (TheBoredMonkey eyes only)" sheet
// spec — money out to creators. Payout Amount is Creator.internalCost
// (already the TBM-only cost field used everywhere else, never new).
export type PayoutCreatorRow = {
  id: string;
  campaignId: string;
  name: string;
  deliverables: string[]; // short platform codes, e.g. ["IGR", "YTD"]
  live: boolean;
  payoutAmount: number | null;
  payoutInvoiceRaised: boolean;
  payoutInvoiceReceived: boolean;
  payoutPaymentStatus: string;
  payoutAdvance: string | null;
  payoutRemark: string | null;
};

const money = (n: number | null) => (n ? `₹${n.toLocaleString("en-IN")}` : "—");

const paymentTone: Record<string, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  ADVANCE_PAID: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  IN_PROCESS: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  PAID: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};

// Yes/No dropdown backed by a real boolean field — mirrors the sheet's own
// "Yes or No dropdown" columns (Invoice Raised, Invoice Received).
function YesNoSelect({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={value ? "yes" : "no"}
      disabled={pending}
      onChange={(e) => startTransition(() => onChange(e.target.value === "yes"))}
      className={`rounded-lg border px-2 py-1 text-xs font-bold outline-none disabled:opacity-50 ${
        value
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
  );
}

// Controlled row — state lives one level up in CreatorPayoutsTable so
// setting Invoice Raised/Received to Yes can re-sort the whole list (rows
// with either flag set float to the top). Saved via updateCreatorPayout on
// each field change (dropdowns) or on blur (free-text Advance/Remark).
function PayoutRow({ row, onChange }: { row: PayoutCreatorRow; onChange: (patch: Partial<PayoutCreatorRow>) => void }) {
  const [advance, setAdvance] = useState(row.payoutAdvance ?? "");
  const [remark, setRemark] = useState(row.payoutRemark ?? "");
  const [, startTransition] = useTransition();

  const save = (fields: Parameters<typeof updateCreatorPayout>[2]) => {
    startTransition(() => {
      updateCreatorPayout(row.id, row.campaignId, fields).catch(() => {});
    });
  };

  return (
    <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
      <td className="border-b border-slate-100 px-4 py-3 text-left font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
        {row.name}
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-600 dark:border-slate-800 dark:text-slate-300">
        {row.deliverables.length > 0 ? row.deliverables.join(", ") : "—"}
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            row.live
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {row.live ? "Live" : "Not live"}
        </span>
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
        {money(row.payoutAmount)}
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800">
        <YesNoSelect
          value={row.payoutInvoiceRaised}
          onChange={(v) => {
            onChange({ payoutInvoiceRaised: v });
            save({ payoutInvoiceRaised: v });
          }}
        />
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800">
        <YesNoSelect
          value={row.payoutInvoiceReceived}
          onChange={(v) => {
            onChange({ payoutInvoiceReceived: v });
            save({ payoutInvoiceReceived: v });
          }}
        />
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800">
        <select
          value={row.payoutPaymentStatus}
          onChange={(e) => {
            onChange({ payoutPaymentStatus: e.target.value });
            save({ payoutPaymentStatus: e.target.value });
          }}
          className={`rounded-lg border-0 px-2 py-1 text-[11px] font-bold outline-none ${paymentTone[row.payoutPaymentStatus] ?? paymentTone.NOT_STARTED}`}
        >
          {PAYOUT_PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PAYOUT_PAYMENT_STATUS_LABELS[s as PayoutPaymentStatus]}
            </option>
          ))}
        </select>
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800">
        <input
          value={advance}
          onChange={(e) => setAdvance(e.target.value)}
          onBlur={() => save({ payoutAdvance: advance || null })}
          placeholder="Add note..."
          className="w-full min-w-[130px] rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1 text-slate-700 outline-none hover:border-slate-300 focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-slate-600 dark:focus:bg-slate-800"
        />
      </td>
      <td className="border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800">
        <input
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          onBlur={() => save({ payoutRemark: remark || null })}
          placeholder="Add note..."
          className="w-full min-w-[150px] rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1 text-slate-700 outline-none hover:border-slate-300 focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-slate-600 dark:focus:bg-slate-800"
        />
      </td>
    </tr>
  );
}

// A row counts as "actioned" once either invoice flag is set to Yes —
// those float to the top, most-recently-actioned first; everything else
// keeps its original order below.
const sortRows = (list: PayoutCreatorRow[]) => {
  const actioned = list.filter((r) => r.payoutInvoiceRaised || r.payoutInvoiceReceived);
  const rest = list.filter((r) => !r.payoutInvoiceRaised && !r.payoutInvoiceReceived);
  return [...actioned, ...rest];
};

export default function CreatorPayoutsTable({ rows: initialRows }: { rows: PayoutCreatorRow[] }) {
  const [rows, setRows] = useState<PayoutCreatorRow[]>(() => sortRows(initialRows));
  // Recency order among the "actioned" rows — the row you most recently
  // flipped to Yes should sit at the very top of that group.
  const order = useMemo(() => new Map<string, number>(), []);
  const nextRank = useMemo(() => ({ current: 0 }), []);

  const handleChange = (id: string, patch: Partial<PayoutCreatorRow>) => {
    setRows((prev) => {
      const updated = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));

      if (patch.payoutInvoiceRaised === true || patch.payoutInvoiceReceived === true) {
        order.set(id, nextRank.current++);
      }

      const actioned = updated
        .filter((r) => r.payoutInvoiceRaised || r.payoutInvoiceReceived)
        .sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0));
      const rest = updated.filter((r) => !r.payoutInvoiceRaised && !r.payoutInvoiceReceived);
      return [...actioned, ...rest];
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Creator</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Deliverables</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Content Status</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Payout Amount</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Invoice Raised</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Invoice Received</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Payment Status</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Advance</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-left dark:border-slate-700">Remark</th>
            </tr>
          </thead>
          <tbody className="font-medium">
            {rows.map((r) => (
              <PayoutRow key={r.id} row={r} onChange={(patch) => handleChange(r.id, patch)} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-slate-400 dark:text-slate-500">
                  No onboarded creators yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
