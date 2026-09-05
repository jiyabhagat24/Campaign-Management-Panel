"use client";

import { useState } from "react";
import { grantClientAccess, removeClientAccess } from "@/lib/actions";

type ClientAccessEntry = { id: string; user: { id: string; name: string } };

export default function ClientRow({
  campaignId,
  clientAccess,
  canAdd,
  canRemove,
}: {
  campaignId: string;
  clientAccess: ClientAccessEntry[];
  canAdd: boolean;
  canRemove: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {clientAccess.map((a) => (
        <span key={a.id} className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
          <span className="text-slate-400 dark:text-slate-500">Client:</span>
          <span className="font-medium text-ink dark:text-white">{a.user.name}</span>
          {canRemove && (
            <button
              onClick={() => removeClientAccess(a.id, campaignId)}
              className="ml-0.5 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100 dark:text-slate-600"
              title="Remove"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {clientAccess.length === 0 && <span className="text-xs text-slate-400 dark:text-slate-500">No client contact added yet.</span>}

      {canAdd && (
        <>
          {!adding ? (
            <button onClick={() => setAdding(true)} className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-brand hover:text-brand dark:border-slate-700 dark:text-slate-400">
              + Assign
            </button>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                if (!email) return;
                try {
                  await grantClientAccess(campaignId, email);
                  setAdding(false);
                  setEmail("");
                } catch (err: any) {
                  setError(err.message ?? "Failed to add client");
                }
              }}
              className="flex items-center gap-1.5"
            >
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@brand.com"
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <button type="submit" className="rounded-lg bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700">Add</button>
              <button type="button" onClick={() => { setAdding(false); setError(null); }} className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">Cancel</button>
              {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
            </form>
          )}
        </>
      )}
    </div>
  );
}
