"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { addClientInvoice, updateClientInvoice, deleteClientInvoice, type ClientInvoiceInput } from "@/lib/actions";
import { FEE_TYPE_LABELS, type FeeType } from "@/lib/constants";
import type { ClientInvoiceRow } from "@/components/campaign/CreatorKanban";

// Steps 28/29 — the campaign-scoped Finance tab. Brand Solutions (canEdit)
// gets the Step 28 "Client Cash" input controls right here in context; a
// client gets the exact same data read-only (Step 29's Finance, client
// view) — deliberately one component for both, since the data itself is
// already entirely client-safe (invoice number/dates/amounts only, no
// creator-level cost/margin — see ClientInvoiceRow).
const EMPTY: ClientInvoiceInput = {
  invoiceNumber: "",
  invoiceRaisedAt: "",
  invoiceAmount: 0,
  amountReceived: 0,
  receivedAt: "",
  paymentTerms: "",
  remark: "",
};

function money(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}
function dateStr(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function toInputDate(d: string | Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export default function ClientInvoicesPanel({
  campaignId,
  canEdit,
  invoices,
  finalClosedCost,
  financeFeeType,
  financeRetainerFee,
  financeAgencyFeePercent,
}: {
  campaignId: string;
  canEdit: boolean;
  invoices: ClientInvoiceRow[];
  // "Total quoted cost at which the campaign closed on the client side" —
  // the sum of onboarded creators' Final Quoted Cost (falling back to
  // Quoted Cost), same computation as the global /finance page's Section B,
  // not Campaign.budgetQuoted (an optional top-level estimate that's often
  // left unset).
  finalClosedCost: number | null;
  financeFeeType: string | null;
  financeRetainerFee: number | null;
  financeAgencyFeePercent: number | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClientInvoiceInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feeType: FeeType = financeFeeType === "RETAINER" ? "RETAINER" : "PERCENTAGE";
  const totalInvoiced = invoices.reduce((s, i) => s + i.invoiceAmount, 0);
  const totalReceived = invoices.reduce((s, i) => s + i.amountReceived, 0);
  const totalDue = Math.max(0, totalInvoiced - totalReceived);

  function openAdd() {
    setDraft(EMPTY);
    setEditingId(null);
    setAdding(true);
    setError(null);
  }
  function openEdit(inv: ClientInvoiceRow) {
    setDraft({
      invoiceNumber: inv.invoiceNumber ?? "",
      invoiceRaisedAt: toInputDate(inv.invoiceRaisedAt),
      invoiceAmount: inv.invoiceAmount,
      amountReceived: inv.amountReceived,
      receivedAt: toInputDate(inv.receivedAt),
      paymentTerms: inv.paymentTerms ?? "",
      remark: inv.remark ?? "",
    });
    setEditingId(inv.id);
    setAdding(true);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updateClientInvoice(editingId, draft);
      } else {
        await addClientInvoice(campaignId, draft);
      }
      setAdding(false);
      setEditingId(null);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this invoice? This can't be undone.")) return;
    setBusy(true);
    try {
      await deleteClientInvoice(id);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Campaign value + billing terms — the client's own contract terms,
          not internal cost/margin. */}
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card dark:bg-slate-900 dark:border-slate-800 sm:grid-cols-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Final Closed Cost</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{finalClosedCost != null ? money(finalClosedCost) : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{FEE_TYPE_LABELS[feeType]}</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {feeType === "RETAINER" ? (financeRetainerFee != null ? money(financeRetainerFee) : "—") : financeAgencyFeePercent != null ? `${financeAgencyFeePercent}%` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total Received</p>
          <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{money(totalReceived)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total Due</p>
          <p className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">{money(totalDue)}</p>
        </div>
      </div>

      {/* Invoices */}
      <div className={`overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Invoices</p>
          {canEdit && !adding && (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add invoice</span>
            </button>
          )}
        </div>

        {adding && (
          <div className="mx-5 mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Invoice #</span>
                <input
                  value={draft.invoiceNumber ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, invoiceNumber: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Raised on</span>
                <input
                  type="date"
                  value={draft.invoiceRaisedAt ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, invoiceRaisedAt: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Invoice Amount</span>
                <input
                  type="number"
                  min={0}
                  value={draft.invoiceAmount}
                  onChange={(e) => setDraft((d) => ({ ...d, invoiceAmount: Number(e.target.value) }))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Amount Received</span>
                <input
                  type="number"
                  min={0}
                  value={draft.amountReceived}
                  onChange={(e) => setDraft((d) => ({ ...d, amountReceived: Number(e.target.value) }))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Received on</span>
                <input
                  type="date"
                  value={draft.receivedAt ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, receivedAt: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Payment Terms</span>
                <input
                  value={draft.paymentTerms ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, paymentTerms: e.target.value }))}
                  placeholder="e.g. Net 30"
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Remark</span>
              <input
                value={draft.remark ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, remark: e.target.value }))}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </label>
            {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                {editingId ? "Save" : "Add"}
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setEditingId(null);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto scrollbar-x-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-t border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                {["Invoice #", "Raised", "Amount", "Received", "Received On", "Terms", "Remark", ""].map((h) => (
                  <th key={h} className="whitespace-nowrap px-5 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="whitespace-nowrap px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">{inv.invoiceNumber || "—"}</td>
                  <td className="whitespace-nowrap px-5 py-3">{dateStr(inv.invoiceRaisedAt)}</td>
                  <td className="whitespace-nowrap px-5 py-3">{money(inv.invoiceAmount)}</td>
                  <td className="whitespace-nowrap px-5 py-3">{money(inv.amountReceived)}</td>
                  <td className="whitespace-nowrap px-5 py-3">{dateStr(inv.receivedAt)}</td>
                  <td className="whitespace-nowrap px-5 py-3">{inv.paymentTerms || "—"}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{inv.remark || "—"}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(inv)} className="text-slate-300 hover:text-indigo-600 dark:text-slate-600 dark:hover:text-indigo-400">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(inv.id)} className="text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-xs text-slate-400 dark:text-slate-500">No invoices logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
