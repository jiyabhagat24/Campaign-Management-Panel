"use client";

import { useState } from "react";
import { updateCampaignFinance } from "@/lib/actions";
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS, type InvoiceStatus, FEE_TYPES, FEE_TYPE_LABELS, type FeeType } from "@/lib/constants";

// Manual entry for the Finance numbers that can't be derived from data
// tracked elsewhere (Fee type — Agency Fee % or a flat Retainer Fee, never
// both — plus Client Invoice status) — no invoicing system exists yet, so
// these are typed in by whoever's tracking finance, same "manual for now,
// goes straight to the database" pattern as Instagram creator stats
// elsewhere in this app. Yet to be Invoiced / Yet to be Received / Value of
// Cleared Due / Creator Payable Pending used to live here too, but are now
// computed automatically on the dashboard from this row's own Client
// Invoice status plus each creator's payout status — see dashboard/page.tsx.
// canEdit follows canSeeInternalCost — clients never see this row.
type FinanceValues = {
  financeAgencyFeePercent: number | null;
  financeClientInvoiceStatus: string | null;
  financeFeeType: string | null;
  financeRetainerFee: number | null;
};

type Props = {
  campaignId: string;
  canEdit: boolean;
  initial: FinanceValues;
};

export default function FinanceRow({ campaignId, canEdit, initial }: Props) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<FinanceValues>(initial);
  const [saving, setSaving] = useState(false);

  const money = (n: number | null) => (n === null || n === undefined ? "—" : `₹${n.toLocaleString("en-IN")}`);
  const pct = (n: number | null) => (n === null || n === undefined ? "—" : `${n}%`);
  const invoiceLabel = (v: string | null) =>
    v && (INVOICE_STATUSES as readonly string[]).includes(v) ? INVOICE_STATUS_LABELS[v as InvoiceStatus] : "—";
  // Legacy campaigns never had a fee type set, but already have a % filled
  // in — default those to PERCENTAGE rather than showing an empty state.
  const feeType: FeeType = values.financeFeeType === "RETAINER" ? "RETAINER" : "PERCENTAGE";

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
          <span className="text-slate-400 dark:text-slate-500">{FEE_TYPE_LABELS[feeType]}:</span>
          <span className="font-medium text-ink dark:text-white">
            {feeType === "RETAINER" ? money(values.financeRetainerFee) : pct(values.financeAgencyFeePercent)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
          <span className="text-slate-400 dark:text-slate-500">Client Invoice status:</span>
          <span className="font-medium text-ink dark:text-white">{invoiceLabel(values.financeClientInvoiceStatus)}</span>
        </span>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-brand hover:text-brand dark:border-slate-700 dark:text-slate-400"
          >
            Edit
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await updateCampaignFinance(campaignId, values);
          setEditing(false);
        } finally {
          setSaving(false);
        }
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Fee type</span>
        <select
          value={feeType}
          onChange={(e) => setValues((v) => ({ ...v, financeFeeType: e.target.value }))}
          className="w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {FEE_TYPES.map((t) => (
            <option key={t} value={t}>
              {FEE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      {feeType === "RETAINER" ? (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Retainer Fee</span>
          <input
            type="number"
            step="0.01"
            value={values.financeRetainerFee ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, financeRetainerFee: e.target.value === "" ? null : Number(e.target.value) }))
            }
            className="w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            placeholder="₹0"
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Agency Fee %</span>
          <input
            type="number"
            step="0.01"
            value={values.financeAgencyFeePercent ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, financeAgencyFeePercent: e.target.value === "" ? null : Number(e.target.value) }))
            }
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            placeholder="0%"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Client Invoice status</span>
        <select
          value={values.financeClientInvoiceStatus ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, financeClientInvoiceStatus: e.target.value || null }))}
          className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="">—</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INVOICE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setValues(initial);
          setEditing(false);
        }}
        className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
      >
        Cancel
      </button>
    </form>
  );
}
