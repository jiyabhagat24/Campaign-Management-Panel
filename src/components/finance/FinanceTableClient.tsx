"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import BrandAvatar from "@/components/campaign/BrandAvatar";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/constants";
import { Calendar, X, Receipt } from "lucide-react";

export type FinanceCampaignRow = {
  id: string;
  name: string;
  brand: string;
  brandLogoUrl: string | null;
  brandSolutionsPoc: string | null;
  budgetQuoted: number | null;
  internalValue: number;
  financeAgencyFee: number | null;
  financeAgencyFeePercent: number | null;
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

      <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Campaign Level Breakdown</h2>
          </div>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            {rows.length} shown
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="sticky left-0 top-0 z-40 w-[200px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Client</th>
                <th className="sticky left-[200px] top-0 z-40 w-[220px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Campaign</th>
                <th className="sticky top-0 z-30 w-[190px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Brand Solutions POC</th>
                <th className="sticky top-0 z-30 w-[160px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Creators Onboarded</th>
                <th className="sticky top-0 z-30 w-[150px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Deliverables Total</th>
                <th className="sticky top-0 z-30 w-[160px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Client Invoice status</th>
                <th className="sticky top-0 z-30 w-[140px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Quoted Value</th>
                <th className="sticky top-0 z-30 w-[140px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Internal Value</th>
                <th className="sticky top-0 z-30 w-[110px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Margin %</th>
                <th className="sticky top-0 z-30 w-[130px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Agency Fee %</th>
                <th className="sticky top-0 z-30 w-[140px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">Agency Fee Value</th>
              </tr>
            </thead>
            <tbody className="font-medium">
              {rows.map((c) => {
                const quotedValue = c.budgetQuoted ?? 0;
                const margin = quotedValue > 0 ? ((quotedValue - c.internalValue) / quotedValue) * 100 : null;

                return (
                  <tr key={c.id} className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="sticky left-0 z-10 w-[200px] min-w-[200px] max-w-[200px] overflow-hidden border-b border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
                      <div className="flex items-center gap-2.5">
                        <BrandAvatar brand={c.brand} logoUrl={c.brandLogoUrl} size={26} />
                        <span className="truncate font-semibold text-slate-900 dark:text-white">{c.brand}</span>
                      </div>
                    </td>
                    <td className="sticky left-[200px] z-10 w-[220px] min-w-[220px] max-w-[220px] overflow-hidden border-b border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
                      <Link href={`/campaigns/${c.id}`} className="block truncate font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-600 dark:border-slate-800 dark:text-slate-300">{c.brandSolutionsPoc ?? "—"}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">{c.creatorsOnboarded}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">{c.deliverablesTotal}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${invoiceTone[c.financeClientInvoiceStatus ?? ""] ?? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                        {invoiceLabel(c.financeClientInvoiceStatus)}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">{money(quotedValue)}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">{money(c.internalValue)}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
                      {margin !== null ? `${margin.toFixed(1)}%` : "—"}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      {c.financeAgencyFeePercent !== null ? `${c.financeAgencyFeePercent}%` : "—"}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-left text-slate-700 dark:border-slate-800 dark:text-slate-200">{money(c.financeAgencyFee)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                    <Receipt className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-medium">
                      {hasRange ? "No creators were onboarded (closed) in this date range." : "No campaigns yet."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
