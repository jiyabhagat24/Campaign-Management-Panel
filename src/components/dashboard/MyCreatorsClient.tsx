"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { formatCompactINR } from "@/lib/format";

export type CreatorRecord = {
  id: string;
  name: string;
  handle: string;
  campaignId: string;
  campaign: string;
  deliverables: string;
  product: string;
  productEta: string | null;
  script: string;
  scriptLinks: string[];
  video: string;
  videoLinks: string[];
  finalInternal: number | null;
  finalQuoted: number | null;
  pendingWith: string;
  note: string;
  timing: "live" | "on_time" | "nearing" | "delayed";
  hasLive: boolean;
  hasOpen: boolean;
  deadlineMs: number | null;
};

const PAGE_SIZE = 25;
const SELECT = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

const TIMING_OPTIONS = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "on_time", label: "On time" },
  { value: "nearing", label: "Nearing deadline" },
  { value: "delayed", label: "Delayed" },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function Links({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-2">
      {urls.map((u, i) => (
        <a key={u + i} href={u} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Link {urls.length > 1 ? i + 1 : ""}
        </a>
      ))}
    </div>
  );
}

export default function MyCreatorsClient({ records, showCost, initialStatus }: { records: CreatorRecord[]; showCost: boolean; initialStatus: string }) {
  const [tab, setTab] = useState<"active" | "live">("active");
  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState("all");
  const [timing, setTiming] = useState(TIMING_OPTIONS.some((o) => o.value === initialStatus) ? initialStatus : "all");
  const [pending, setPending] = useState("all");
  const [page, setPage] = useState(1);

  const activeCount = records.filter((r) => r.hasOpen).length;
  const liveCount = records.filter((r) => r.hasLive).length;
  const campaigns = useMemo(() => Array.from(new Set(records.map((r) => r.campaign))).sort(), [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (tab === "active" ? !r.hasOpen : !r.hasLive) return false;
      if (campaign !== "all" && r.campaign !== campaign) return false;
      if (timing !== "all" && r.timing !== timing) return false;
      if (pending !== "all" && r.pendingWith !== pending) return false;
      if (q && !`${r.name} ${r.handle} ${r.campaign}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [records, tab, search, campaign, timing, pending]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function exportCsv() {
    const header = ["Creator", "Handle", "Campaign", "Deliverables", "Product", "Script", "Video", ...(showCost ? ["Final internal", "Final quoted"] : []), "Pending with", "Deadline note"];
    const lines = filtered.map((r) =>
      [r.name, r.handle, r.campaign, r.deliverables, r.product, r.script, r.video, ...(showCost ? [r.finalInternal ?? "", r.finalQuoted ?? ""] : []), r.pendingWith, r.note]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "creator-records.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabClass = (active: boolean) =>
    `rounded-lg px-4 py-2 text-xs font-semibold ${active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Creator records</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">All creators assigned to you across campaigns</p>
        </div>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <Download className="h-3.5 w-3.5" /> Export Excel
        </button>
      </div>

      <div className="flex gap-2">
        <button type="button" className={tabClass(tab === "active")} onClick={() => { setTab("active"); setPage(1); }}>Active creators ({activeCount})</button>
        <button type="button" className={tabClass(tab === "live")} onClick={() => { setTab("live"); setPage(1); }}>Live creators ({liveCount})</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search creator, handle or campaign"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </div>
        <select value={campaign} onChange={(e) => { setCampaign(e.target.value); setPage(1); }} className={SELECT}>
          <option value="all">Campaign: All</option>
          {campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={timing} onChange={(e) => { setTiming(e.target.value); setPage(1); }} className={SELECT}>
          {TIMING_OPTIONS.map((o) => <option key={o.value} value={o.value}>Deliverables: {o.label}</option>)}
        </select>
        <select value={pending} onChange={(e) => { setPending(e.target.value); setPage(1); }} className={SELECT}>
          <option value="all">Pending with: All</option>
          <option value="Creator">Creator</option>
          <option value="Client">Client</option>
          <option value="Internal team">Internal team</option>
        </select>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">Sorted by next deadline</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Creator</th>
              <th className="px-4 py-3 text-left">Campaign</th>
              <th className="px-4 py-3 text-left">Deliverables</th>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-left">Script status &amp; links</th>
              <th className="px-4 py-3 text-left">Video status &amp; links</th>
              {showCost && <th className="px-4 py-3 text-right">Final internal</th>}
              {showCost && <th className="px-4 py-3 text-right">Final quoted</th>}
              <th className="px-4 py-3 text-left">Pending / deadline</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.length === 0 ? (
              <tr><td colSpan={showCost ? 10 : 8} className="px-4 py-6 text-center text-xs text-slate-400">No data available</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{initials(r.name)}</div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{r.name}</p>
                      <p className="text-[11px] text-slate-400">{r.handle}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{r.campaign}</td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{r.deliverables}</td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                  {r.product}
                  {r.productEta && <p className="text-[11px] text-slate-400">ETA {r.productEta}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{r.script}<Links urls={r.scriptLinks} /></td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{r.video}<Links urls={r.videoLinks} /></td>
                {showCost && <td className="px-4 py-3 text-right text-xs text-slate-600 dark:text-slate-300">{r.finalInternal !== null ? formatCompactINR(r.finalInternal) : "—"}</td>}
                {showCost && <td className="px-4 py-3 text-right text-xs text-slate-600 dark:text-slate-300">{r.finalQuoted !== null ? formatCompactINR(r.finalQuoted) : "—"}</td>}
                <td className="px-4 py-3 text-xs">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">{r.pendingWith}</p>
                  <p className={`text-[11px] ${r.timing === "delayed" ? "text-rose-600" : r.timing === "nearing" ? "text-amber-600" : "text-slate-400"}`}>{r.note}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/campaigns/${r.campaignId}`} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">View record</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Rows per page: {PAGE_SIZE} · {filtered.length} records</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40 dark:border-slate-700">Prev</button>
          <span>Page {safePage} of {pageCount}</span>
          <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40 dark:border-slate-700">Next</button>
        </div>
      </div>
    </div>
  );
}
