"use client";

import { useMemo, useState, useTransition } from "react";
import { setClientCampaignAccess } from "@/lib/actions";
import { ChevronDown, Search, UserCheck } from "lucide-react";

export type ClientRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string; // ISO
  brandName: string | null;
  phone: string | null;
  isSelfSignup: boolean;
  campaignIds: string[]; // campaigns this client currently has access to
};

export type CampaignOption = {
  id: string;
  name: string;
  brand: string;
  status: string;
};

// One client at a time, expanded into a checklist of every campaign —
// checking/unchecking calls setClientCampaignAccess immediately (no separate
// "Save" step, same instant-toggle pattern as CampaignStatusSelect
// elsewhere in the app). Local state is updated optimistically and reverted
// if the server call fails.
export default function ClientAccessManager({ clients, campaigns }: { clients: ClientRow[]; campaigns: CampaignOption[] }) {
  const [rows, setRows] = useState(clients);
  const [expandedId, setExpandedId] = useState<string | null>(clients[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.brandName ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  function toggle(clientId: string, campaignId: string, next: boolean) {
    const key = `${clientId}:${campaignId}`;
    setError(null);
    setPendingKey(key);

    // Optimistic update.
    setRows((prev) =>
      prev.map((c) =>
        c.id !== clientId
          ? c
          : {
              ...c,
              campaignIds: next ? [...c.campaignIds, campaignId] : c.campaignIds.filter((id) => id !== campaignId),
            }
      )
    );

    startTransition(async () => {
      try {
        await setClientCampaignAccess(clientId, campaignId, next);
      } catch (err) {
        // Revert on failure.
        setRows((prev) =>
          prev.map((c) =>
            c.id !== clientId
              ? c
              : {
                  ...c,
                  campaignIds: next ? c.campaignIds.filter((id) => id !== campaignId) : [...c.campaignIds, campaignId],
                }
          )
        );
        setError(err instanceof Error ? err.message : "Failed to update access.");
      } finally {
        setPendingKey(null);
      }
    });
  }

  const filteredCampaigns = useMemo(() => {
    const q = campaignSearch.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => c.name.toLowerCase().includes(q) || c.brand.toLowerCase().includes(q));
  }, [campaigns, campaignSearch]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients by name, email, or brand"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {filteredClients.map((c) => {
          const expanded = expandedId === c.id;
          return (
            <div
              key={c.id}
              className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => {
                  setExpandedId(expanded ? null : c.id);
                  setCampaignSearch("");
                }}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-slate-900 dark:text-white">{c.name}</p>
                    {c.isSelfSignup && (
                      <span className="flex-shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                        Self sign-up
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {c.email}
                    {c.brandName ? ` · ${c.brandName}` : ""}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {c.campaignIds.length} campaign{c.campaignIds.length === 1 ? "" : "s"}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {expanded && (
                <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                  {campaigns.length > 6 && (
                    <div className="relative mb-3 max-w-xs">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={campaignSearch}
                        onChange={(e) => setCampaignSearch(e.target.value)}
                        placeholder="Filter campaigns"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {filteredCampaigns.map((camp) => {
                      const checked = c.campaignIds.includes(camp.id);
                      const key = `${c.id}:${camp.id}`;
                      const isPending = pendingKey === key;
                      return (
                        <label
                          key={camp.id}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                            checked
                              ? "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40"
                              : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                          } ${isPending ? "opacity-60" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isPending}
                            onChange={(e) => toggle(c.id, camp.id, e.target.checked)}
                            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-800 dark:text-slate-100">{camp.name}</span>
                            <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {camp.brand} · {camp.status}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {filteredCampaigns.length === 0 && (
                      <p className="col-span-full py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                        No campaigns match.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredClients.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-12 text-center dark:border-slate-800">
            <UserCheck className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
              {clients.length === 0 ? "No clients yet." : "No clients match your search."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
