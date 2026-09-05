"use client";

import { useActionState } from "react";
import { ExternalLink } from "lucide-react";
import {
  addScoutedCreator,
  qualifyScoutedCreator,
  rejectScoutedCreator,
  promoteScoutedCreatorToCampaign,
  searchYoutubeCreatorsManually,
} from "@/lib/actions";
import { PLATFORM_LABELS } from "@/lib/constants";

type SearchResult = { added: number; found: number; skippedNotIndia: number; skippedBelowThreshold: number } | { error: string } | null;

async function runSearch(_prev: SearchResult, formData: FormData): Promise<SearchResult> {
  try {
    return await searchYoutubeCreatorsManually(formData);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Search failed." };
  }
}

type Scouted = {
  id: string;
  name: string;
  handle: string;
  platform: string;
  followers: number | null;
  avgViews: number | null;
  engagementRate: number | null;
  niche: string | null;
  score: number | null;
  status: string;
  source: string | null;
  instagramHandle: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700",
  QUALIFIED: "bg-blue-50 text-blue-700",
  OUTREACH_QUEUED: "bg-amber-50 text-amber-700",
  OUTREACH_SENT: "bg-amber-50 text-amber-700",
  RESPONDED: "bg-purple-50 text-purple-700",
  REJECTED: "bg-red-50 text-red-700",
  PROMOTED: "bg-emerald-50 text-emerald-700",
};

export default function ScoutingBoard({ scouted, campaigns }: { scouted: Scouted[]; campaigns: { id: string; name: string }[] }) {
  const [searchResult, searchAction, searching] = useActionState(runSearch, null);

  return (
    <div className="mt-6 space-y-6">
      <details className="rounded-xl border border-slate-200 bg-white p-4" open>
        <summary className="cursor-pointer text-sm font-medium text-ink">Search YouTube for creators</summary>
        <form action={searchAction} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input name="searchQuery" placeholder="Topic (e.g. skincare, fitness)" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="searchLocation" placeholder="India location, optional (e.g. Mumbai, Tier-2)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" disabled={searching} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {searching ? "Searching…" : "Search YouTube"}
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          Only India-based channels with 500+ subscribers are added. Adding a location narrows the search further — e.g. "skincare Mumbai" instead of just "skincare".
        </p>
        {searchResult && "error" in searchResult && (
          <p className="mt-2 text-xs font-medium text-red-600">{searchResult.error}</p>
        )}
        {searchResult && "added" in searchResult && (
          <p className="mt-2 text-xs font-medium text-emerald-600">
            Found {searchResult.found}, added {searchResult.added} new creator{searchResult.added === 1 ? "" : "s"} to the queue
            {searchResult.skippedNotIndia > 0 ? ` (skipped ${searchResult.skippedNotIndia} non-India channel${searchResult.skippedNotIndia === 1 ? "" : "s"})` : ""}
            {searchResult.skippedBelowThreshold > 0 ? ` (skipped ${searchResult.skippedBelowThreshold} under 500 subscribers)` : ""}.
          </p>
        )}
      </details>

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">+ Import a creator manually</summary>
        <form action={addScoutedCreator} className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <input name="name" placeholder="Creator name" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="handle" placeholder="@handle" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select name="platform" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {Object.entries(PLATFORM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input name="followers" type="number" placeholder="Followers" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="avgViews" type="number" placeholder="Avg views" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="niche" placeholder="Niche" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Add to queue</button>
        </form>
      </details>

      <p className="text-xs font-medium text-slate-500">{scouted.length} creator{scouted.length === 1 ? "" : "s"} in the queue</p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="w-10 px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Creator</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Followers</th>
              <th className="px-4 py-3 font-medium">Engagement</th>
              <th className="px-4 py-3 font-medium">Fit score</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {scouted.map((s, i) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-ink">{s.name}<div className="text-xs text-slate-400">{s.handle} · {s.niche ?? "—"}</div></td>
                <td className="px-4 py-3 text-slate-600">
                  <div>{PLATFORM_LABELS[s.platform as keyof typeof PLATFORM_LABELS] ?? s.platform}</div>
                  {s.instagramHandle && (
                    <a
                      href={`https://www.instagram.com/${s.instagramHandle}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-pink-600 hover:underline"
                      title="Instagram handle found in this channel's YouTube description"
                    >
                      <span>@{s.instagramHandle}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{s.followers?.toLocaleString("en-IN") ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{s.engagementRate ? `${s.engagementRate.toFixed(1)}%` : "—"}</td>
                <td className="px-4 py-3 font-medium">{s.score ?? "—"}</td>
                <td className="px-4 py-3"><span className={`badge ${STATUS_COLOR[s.status]}`}>{s.status.replace(/_/g, " ").toLowerCase()}</span></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {s.status === "NEW" && (
                      <button onClick={() => qualifyScoutedCreator(s.id)} className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">Qualify</button>
                    )}
                    {s.status !== "REJECTED" && s.status !== "PROMOTED" && (
                      <button onClick={() => rejectScoutedCreator(s.id)} className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100">Reject</button>
                    )}
                    {s.status === "QUALIFIED" && campaigns.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) promoteScoutedCreatorToCampaign(s.id, e.target.value);
                        }}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="" disabled>Promote to campaign...</option>
                        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {scouted.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Queue is empty.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
