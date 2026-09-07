"use client";

import { useState } from "react";
import { updateCampaignFinance } from "@/lib/actions";
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/constants";

// Manual entry for the Finance numbers the dashboard's Summary row and the
// Finance Table report both roll up (Yet to be Invoiced / Yet to be
// Received / Value of Cleared Due / Creator Payable Pending / Agency Fee /
// Agency Fee % / Client Invoice status) — no invoicing system exists yet,
// so these are typed in by whoever's tracking finance, same "manual for
// now, goes straight to the database" pattern as Instagram creator stats
// elsewhere in this app. canEdit follows canSeeInternalCost — clients never
// see this row.
type FinanceValues = {
  financeYetToBeInvoiced: number | null;
  financeYetToBeReceived: number | null;
  financeValueOfClearedDue: number | null;
  financeCreatorPayablePending: number | null;
  financeAgencyFee: number | null;
  financeAgencyFeePercent: number | null;
  financeClientInvoiceStatus: string | null;
};

type Props = {
  campaignId: string;
  canEdit: boolean;
  initial: FinanceValues;
};

// Narrower than `keyof FinanceValues` on purpose: financeClientInvoiceStatus
// is a string, not a number, and money() below only accepts number | null —
// widening this to the full keyof union made values[f.key] infer as
// string | number | null, which is what broke the production type-check.
type MoneyFieldKey = Exclude<keyof FinanceValues, "financeClientInvoiceStatus">;

const MONEY_FIELDS: { key: MoneyFieldKey; label: string }[] = [
  { key: "financeYetToBeInvoiced", label: "Yet to be Invoiced" },
  { key: "financeYetToBeReceived", label: "Yet to be Received" },
  { key: "financeValueOfClearedDue", label: "Value of Cleared Due" },
  { key: "financeCreatorPayablePending", label: "Creator Payable Pending" },
  { key: "financeAgencyFee", label: "Agency Fee" },
];

export default function FinanceRow({ campaignId, canEdit, initial }: Props) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<FinanceValues>(initial);
  const [saving, setSaving] = useState(false);

  const money = (n: number | null) => (n === null || n === undefined ? "—" : `₹${n.toLocaleString("en-IN")}`);
  const invoiceLabel = (v: string | null) =>
    v && (INVOICE_STATUSES as readonly string[]).includes(v) ? INVOICE_STATUS_LABELS[v as InvoiceStatus] : "—";

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {MONEY_FIELDS.map((f) => (
          <span
            key={f.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            <span className="text-slate-400 dark:text-slate-500">{f.label}:</span>
            <span className="font-medium text-ink dark:text-white">{money(values[f.key])}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
          <span className="text-slate-400 dark:text-slate-500">Agency Fee %:</span>
          <span className="font-medium text-ink dark:text-white">
            {values.financeAgencyFeePercent === null ? "—" : `${values.financeAgencyFeePercent}%`}
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
      {MONEY_FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{f.label}</span>
          <input
            type="number"
            step="0.01"
            value={values[f.key] ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))
            }
            className="w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            placeholder="₹0"
          />
        </label>
      ))}

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
