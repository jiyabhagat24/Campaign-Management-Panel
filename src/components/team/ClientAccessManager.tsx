"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setClientCampaignAccess } from "@/lib/actions";
import { Search, UserCheck, X, Plus } from "lucide-react";

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

// Each client's granted campaigns render as small removable chips, with a
// type-to-filter "Add campaign" combobox next to them for granting more —
// scales far better than rendering every campaign as a checkbox for every
// client (that grid gets enormous once there are more than a handful of
// campaigns). Checking/unchecking calls setClientCampaignAccess immediately
// (no separate "Save" step, same instant-toggle pattern as
// CampaignStatusSelect elsewhere in the app); local state is updated
// optimistically and reverted if the server call fails.
export default function ClientAccessManager({ clients, campaigns }: { clients: ClientRow[]; campaigns: CampaignOption[] }) {
  const [rows, setRows] = useState(clients);
  const [search, setSearch] = useState("");
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

  const campaignById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);

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

  return (
    <div className="space-y-4">
      {clients.length > 4 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by name, email, or brand"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {filteredClients.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
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

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {c.campaignIds.map((campId) => {
                const camp = campaignById.get(campId);
                if (!camp) return null;
                const isPending = pendingKey === `${c.id}:${campId}`;
                return (
                  <span
                    key={campId}
                    className={`flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 py-1.5 pl-3 pr-1.5 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 ${
                      isPending ? "opacity-60" : ""
                    }`}
                  >
                    {camp.name}
                    <span className="font-normal text-indigo-400 dark:text-indigo-500">· {camp.brand}</span>
                    <button
                      type="button"
                      onClick={() => toggle(c.id, campId, false)}
                      disabled={isPending}
                      title="Remove access"
                      className="rounded-full p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700 disabled:opacity-50 dark:text-indigo-500 dark:hover:bg-indigo-900/60 dark:hover:text-indigo-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}

              <AddCampaignCombobox
                campaigns={campaigns}
                excludeIds={c.campaignIds}
                onAdd={(campaignId) => toggle(c.id, campaignId, true)}
              />

              {c.campaignIds.length === 0 && campaigns.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500">No campaigns yet.</p>
              )}
            </div>
          </div>
        ))}

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

// Small type-to-filter "Add campaign" control: click the pill to open a
// short dropdown, type to narrow it down (by name or brand), click a result
// to grant access. Only ever lists campaigns this client doesn't already
// have (excludeIds) — the list shrinks as campaigns get added, so it stays
// usable even with hundreds of campaigns on the books.
function AddCampaignCombobox({
  campaigns,
  excludeIds,
  onAdd,
}: {
  campaigns: CampaignOption[];
  excludeIds: string[];
  onAdd: (campaignId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const available = useMemo(() => {
    const excluded = new Set(excludeIds);
    const q = query.trim().toLowerCase();
    return campaigns
      .filter((c) => !excluded.has(c.id))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.brand.toLowerCase().includes(q))
      .slice(0, 8);
  }, [campaigns, excludeIds, query]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
        >
          <Plus className="h-3.5 w-3.5" />
          Add campaign
        </button>
      ) : (
        <div className="w-64 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full rounded-t-xl border-b border-slate-100 px-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {available.map((camp) => (
              <button
                key={camp.id}
                type="button"
                onClick={() => {
                  onAdd(camp.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full flex-col items-start px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="font-semibold text-slate-800 dark:text-slate-100">{camp.name}</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {camp.brand} · {camp.status}
                </span>
              </button>
            ))}
            {available.length === 0 && (
              <p className="px-3 py-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
                {campaigns.length === 0 ? "No campaigns yet." : "No matching campaigns."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
