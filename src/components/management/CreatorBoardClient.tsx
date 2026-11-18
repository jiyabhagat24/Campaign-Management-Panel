"use client";

// Compact creator board — the sandbox's Active / Live creator views rebuilt
// with five columns and an expandable row, in the panel's palette.

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { PLATFORM_LABELS, type Platform } from "@/lib/constants";
import { PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";

type Deliverable = {
  id: string; platform: string; title: string | null; productStatus: string | null; scriptDocUrl: string | null; scriptStatus: string | null;
  contentStatus: string | null; reviewLink: string | null; liveLink: string | null; liveDate: string | null; views: number | null; likes: number | null; comments: number | null;
};
export type BoardRow = {
  id: string; name: string; handle: string; status: string; ballOwner: string; campaignId: string; campaign: string; brand: string;
  owner: string | null; deadline: string | null; internalCost: number | null; quoted: number | null; locked: boolean; payment: string | null;
  clientIntent: string | null; deliverables: Deliverable[];
};

const inr = (n: number | null) => (n === null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const human = (s: string | null) => (s ? s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) : "—");
const num = (n: number | null) => (n ?? 0).toLocaleString("en-IN");
const BALL: Record<string, string> = { TBM: "Internal team", CLIENT: "Client", CREATOR: "Creator", BLOCKED: "Blocked" };
const STAGE: Record<string, string> = {
  SHORTLISTED: "Shortlisted", CLIENT_LIKED: "Client interested", CLIENT_NEGOTIATING: "Negotiating", ONBOARDED: "Onboarded", BLOCKED: "Paused",
};

function stageOf(r: BoardRow) {
  if (r.status !== "ONBOARDED") return STAGE[r.status] ?? human(r.status);
  const open = r.deliverables.filter((d) => !d.liveLink);
  if (!open.length) return "All live";
  const d = open[0];
  if (d.contentStatus) return `Video · ${human(d.contentStatus)}`;
  if (d.scriptStatus) return `Script · ${human(d.scriptStatus)}`;
  if (d.productStatus && d.productStatus !== "DELIVERED") return `Product · ${human(d.productStatus)}`;
  return "Execution";
}

export default function CreatorBoardClient({ rows, showInternal, showQuoted, nowIso }: { rows: BoardRow[]; showInternal: boolean; showQuoted: boolean; nowIso: string }) {
  const [tab, setTab] = useState<"active" | "live">("active");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const now = new Date(nowIso).getTime();

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => (tab === "live" ? r.deliverables.some((d) => d.liveLink) : !(r.deliverables.length > 0 && r.deliverables.every((d) => d.liveLink))))
      .filter((r) => !term || [r.name, r.handle, r.campaign, r.brand, r.owner ?? ""].some((v) => v.toLowerCase().includes(term)));
  }, [rows, tab, q]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline title="Creator records." subtitle="Every creator in your campaigns, one row each. Open a row for scripts, videos, live links and metrics." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold dark:bg-slate-900">
          {(["active", "live"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-1.5 ${tab === t ? "bg-white text-slate-900 shadow-card dark:bg-slate-800 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
              {t === "active" ? "Active creators" : "Live creators"}
            </button>
          ))}
        </div>
        <label className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 sm:w-72 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creator, campaign, owner" className="w-full bg-transparent text-sm text-slate-800 outline-none dark:text-slate-100" />
        </label>
      </div>

      <SandboxCard title={tab === "active" ? "Active creators" : "Live creators"} aside={<span className="text-xs text-slate-500 dark:text-slate-400">{filtered.length} records</span>}>
        <table className="w-full table-fixed text-sm">
          <thead className={`${theadClass} sticky top-0 z-10`}>
            {tab === "active" ? (
              <tr>
                <th className={`w-[28%] ${thClass}`}>Creator / campaign</th>
                <th className={`w-[22%] ${thClass}`}>Stage / waiting on</th>
                <th className={`w-[16%] ${thClass}`}>Next commitment</th>
                <th className={`w-[20%] ${thClass}`}>Commercials / payment</th>
                <th className={`w-[14%] ${thClass}`}>Owner</th>
              </tr>
            ) : (
              <tr>
                <th className={`w-[28%] ${thClass}`}>Creator / campaign</th>
                <th className={`w-[22%] ${thClass}`}>Live links</th>
                <th className={`w-[18%] ${thClass}`}>Final commercials</th>
                <th className={`w-[12%] ${thClass}`}>Payment</th>
                <th className={`w-[20%] ${thClass}`}>Views / likes / comments</th>
              </tr>
            )}
          </thead>
          <tbody className={tbodyClass}>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No matching creators.</td></tr>
            )}
            {filtered.map((r) => {
              const isOpen = open === r.id;
              const overdue = r.deadline && new Date(r.deadline).getTime() < now;
              const live = r.deliverables.filter((d) => d.liveLink);
              return (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer align-top hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setOpen(isOpen ? null : r.id)}>
                    <td className="px-5 py-3">
                      <div className="flex items-start gap-1.5">
                        {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-white">{r.name}</p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.brand} · {r.campaign}</p>
                        </div>
                      </div>
                    </td>
                    {tab === "active" ? (
                      <>
                        <td className="px-5 py-3">
                          <p className="truncate text-slate-700 dark:text-slate-300">{stageOf(r)}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Waiting on {BALL[r.ballOwner] ?? human(r.ballOwner)}</p>
                        </td>
                        <td className={`px-5 py-3 text-xs ${overdue ? "font-semibold text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-300"}`}>
                          {r.deadline ? `Go-live ${new Date(r.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}${overdue ? " · overdue" : ""}` : r.status === "ONBOARDED" ? "No deadline" : "Client decision"}
                        </td>
                        <td className="px-5 py-3">
                          {showQuoted && <p className="text-slate-700 dark:text-slate-300">{inr(r.quoted)} quoted{r.locked ? " · locked" : ""}</p>}
                          {showInternal && <p className="text-xs text-slate-500 dark:text-slate-400">{inr(r.internalCost)} internal · {human(r.payment)}</p>}
                          {!showQuoted && !showInternal && <span className="text-xs text-slate-400">—</span>}
                        </td>
                        <td className="truncate px-5 py-3 text-xs text-slate-600 dark:text-slate-300">{r.owner ?? "Not set"}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-5 py-3">
                          {live.map((d) => (
                            <a key={d.id} href={d.liveLink as string} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="block truncate text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                              {PLATFORM_LABELS[d.platform as Platform] ?? d.platform}
                            </a>
                          ))}
                        </td>
                        <td className="px-5 py-3">
                          {showQuoted && <p className="text-slate-700 dark:text-slate-300">{inr(r.quoted)} quoted</p>}
                          {showInternal && <p className="text-xs text-slate-500 dark:text-slate-400">{inr(r.internalCost)} internal</p>}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-300">{showInternal ? human(r.payment) : "—"}</td>
                        <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
                          <p className="font-semibold">{num(live.reduce((s, d) => s + (d.views ?? 0), 0))} views</p>
                          <p className="text-slate-500 dark:text-slate-400">{num(live.reduce((s, d) => s + (d.likes ?? 0), 0))} likes · {num(live.reduce((s, d) => s + (d.comments ?? 0), 0))} comments</p>
                        </td>
                      </>
                    )}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} className="bg-slate-50/70 px-5 py-4 dark:bg-slate-950/40">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-xs text-slate-500 dark:text-slate-400">@{r.handle.replace(/^@/, "")} · {STAGE[r.status] ?? human(r.status)}</p>
                          <Link href={`/campaigns/${r.campaignId}`} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Open campaign →</Link>
                        </div>
                        {r.deliverables.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">No deliverables yet.</p>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {r.deliverables.map((d) => (
                              <div key={d.id} className="rounded-xl border border-slate-200/80 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                                <p className="font-semibold text-slate-900 dark:text-white">{PLATFORM_LABELS[d.platform as Platform] ?? d.platform}{d.title ? ` · ${d.title}` : ""}</p>
                                <dl className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                                  <div className="flex justify-between gap-2"><dt>Product</dt><dd>{human(d.productStatus)}</dd></div>
                                  <div className="flex justify-between gap-2"><dt>Script</dt><dd>{d.scriptDocUrl ? <a href={d.scriptDocUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{human(d.scriptStatus)}</a> : human(d.scriptStatus)}</dd></div>
                                  <div className="flex justify-between gap-2"><dt>Video</dt><dd>{d.reviewLink ? <a href={d.reviewLink} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{human(d.contentStatus)}</a> : human(d.contentStatus)}</dd></div>
                                  <div className="flex justify-between gap-2"><dt>Live</dt><dd>{d.liveLink ? <a href={d.liveLink} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{d.liveDate ? new Date(d.liveDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Open"}</a> : "Not live"}</dd></div>
                                  {d.liveLink && <div className="flex justify-between gap-2"><dt>Views / likes / comments</dt><dd>{num(d.views)} / {num(d.likes)} / {num(d.comments)}</dd></div>}
                                </dl>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </SandboxCard>
    </div>
  );
}
