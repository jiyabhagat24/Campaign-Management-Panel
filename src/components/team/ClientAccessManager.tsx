"use client";

import { useMemo, useState, useTransition } from "react";
import { setClientCampaignAccess } from "@/lib/actions";
import { Search, UserCheck } from "lucide-react";

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

// Every client's campaign checkboxes are shown right away, no expand/click
// needed — checking/unchecking calls setClientCampaignAccess immediately
// (no separate "Save" step, same instant-toggle pattern as
// CampaignStatusSelect elsewhere in the app). Local state is updated
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

            <div className="mt-3 flex flex-wrap gap-2">
              {campaigns.map((camp) => {
                const checked = c.campaignIds.includes(camp.id);
                const key = `${c.id}:${camp.id}`;
                const isPending = pendingKey === key;
                return (
                  <label
                    key={camp.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      checked
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                    } ${isPending ? "opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPending}
                      onChange={(e) => toggle(c.id, camp.id, e.target.checked)}
                      className="h-3.5 w-3.5 flex-shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {camp.name}
                    <span className="font-normal text-slate-400 dark:text-slate-500">· {camp.brand}</span>
                  </label>
                );
              })}
              {campaigns.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No campaigns yet.</p>}
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
