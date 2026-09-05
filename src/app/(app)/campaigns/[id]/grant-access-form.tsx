"use client";

import { useState } from "react";
import { grantClientAccess } from "@/lib/actions";

export default function GrantClientAccessForm({ campaignId }: { campaignId: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await grantClientAccess(campaignId, email);
          setEmail("");
        } catch (err: any) {
          setError(err.message ?? "Failed to grant access");
        }
      }}
      className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800/60 dark:bg-amber-950/40"
    >
      <span className="text-amber-700 dark:text-amber-300">No client has access to this campaign yet. Invite by email:</span>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="client@brand.com"
        className="rounded-lg border border-amber-300 px-2 py-1 text-xs dark:border-amber-700 dark:bg-slate-900 dark:text-slate-200"
      />
      <button type="submit" className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700">Grant access</button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </form>
  );
}
