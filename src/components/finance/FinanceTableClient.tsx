"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import BrandAvatar from "@/components/campaign/BrandAvatar";
import { INVOICE_STATUS_LABELS, type InvoiceStatus, ASSOCIATION_TYPE_LABELS, type FeeType } from "@/lib/constants";
import { Calendar, X, Receipt } from "lucide-react";

export type FinanceCampaignRow = {
  id: string;
  name: string;
  brand: string;
  brandLogoUrl: string | null;
  brandSolutionsPoc: string | null;
  budgetQuoted: number | null;
  // Sum of each onboarded creator's own Final Quoted Cost (falling back to
  // Quoted Cost) — the real committed revenue figure, as opposed to
  // budgetQuoted, an optional top-level estimate frequently left unset.
  quotedValue: number;
  internalValue: number;
  financeAgencyFee: number | null;
  financeAgencyFeePercent: number | null;
  // Same PERCENTAGE/RETAINER split as FinanceRow.tsx on the campaign page —
  // a Retainer-basis campaign has financeRetainerFee set, not
  // financeAgencyFeePercent, so the Fee columns below need to know which
  // applies rather than always reading the percentage field.
  financeFeeType: string | null;
  financeRetainerFee: number | null;
  financeClientInvoiceStatus: string | null;
  onboardedCreators: { onboardedAt: string; deliverableCount: number }[];
};

const invoiceLabel = (v: string | null) =>
  v && v in INVOICE_STATUS_LABELS ? INVOICE_STATUS_LABELS[v as InvoiceStatus] : "—";

const invoiceTone: Record<string, string> = {
  NOT_INVOICED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  INVOICED: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  PAID: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};

export default function FinanceTableClient({ campaigns }: { campaigns: FinanceCampaignRow[] }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const hasRange = !!(dateFrom || dateTo);

  // For each campaign, narrow its onboarded creators down to the ones whose
  // onboarding ("closure") date falls in the selected range. With no range
  // set, every onboarded creator counts and every campaign shows — matches
  // the sheet's plain campaign list when no filter is applied.
  const rows = useMemo(() => {
    return campaigns
      .map((c) => {
        const inRange = c.onboardedCreators.filter((cr) => {
          const t = new Date(cr.onboardedAt).getTime();
          if (dateFrom && t < new Date(dateFrom).getTime()) return false;
          if (dateTo && t > new Date(`${dateTo}T23:59:59`).getTime()) return false;
          return true;
        });
        return {
          ...c,
          creatorsOnboarded: inRange.length,
          deliverablesTotal: inRange.reduce((s, cr) => s + cr.deliverableCount, 0),
        };
      })
      .filter((c) => !hasRange || c.creatorsOnboarded > 0);
  }, [campaigns, dateFrom, dateTo]);

  const money = (n: number | null | undefined) => (n ? `₹${n.toLocaleString("en-IN")}` : "—");

  return (
    <div className="space-y-6">
      {/* Date range — the sheet's one and only filter on this tab
          ("Select Start and End Date"), styled as the same compact chips
          as the dashboard's filter bar for consistency. */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
        <input
          type="date"
          title="Start date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold outline-none transition-colors ${
            dateFrom
              ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
              : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          }`}
        />
        <span className="text-xs text-slate-300 dark:text-slate-600">–</span>
        <input
          type="date"
          title="End date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold outline-none transition-colors ${
            dateTo
              ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
              : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          }`}
        />
        {hasRange && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Campaign level breakdown</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">{rows.length} records</span>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-5 py-2.5">Campaign / client</th>
              <th className="px-5 py-2.5">Brand Solutions POC</th>
              <th className="px-5 py-2.5">Delivery</th>
              <th className="px-5 py-2.5">Client invoice</th>
              <th className="px-5 py-2.5">Quoted / internal</th>
              <th className="px-5 py-2.5">Margin / fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((c) => {
              const quotedValue = c.quotedValue;
              const margin = quotedValue > 0 ? ((quotedValue - c.internalValue) / quotedValue) * 100 : null;
              const feeType =
                c.financeFeeType === "RETAINER" || c.financeFeeType === "PERCENTAGE"
                  ? ASSOCIATION_TYPE_LABELS[c.financeFeeType as FeeType]
                  : "—";
              const feeValue =
                c.financeFeeType === "RETAINER"
                  ? money(c.financeRetainerFee)
                  : c.financeAgencyFeePercent !== null
                  ? `${c.financeAgencyFeePercent}%`
                  : "—";
              return (
                <tr key={c.id} className="align-top transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3">
                    <Link href={`/campaigns/${c.id}`} className="font-semibold text-slate-900 hover:text-indigo-700 hover:underline dark:text-white dark:hover:text-indigo-300">
                      {c.name}
                    </Link>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{c.brand}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{c.brandSolutionsPoc ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="text-slate-900 dark:text-white">{c.creatorsOnboarded} creators onboarded</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{c.deliverablesTotal} deliverables</div>
                  </td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{invoiceLabel(c.financeClientInvoiceStatus)}</td>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">{money(quotedValue)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Internal {money(c.internalValue)}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">{margin !== null ? `${margin.toFixed(1)}%` : "—"}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{feeType} · {feeValue}</div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  {hasRange ? "No creators were onboarded (closed) in this date range." : "No campaigns yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
