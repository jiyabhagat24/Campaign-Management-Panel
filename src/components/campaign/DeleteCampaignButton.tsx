"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteCampaign } from "@/lib/actions";

// Confirms twice-removed from an accidental click (a native confirm() dialog,
// since this permanently deletes the campaign and everything under it —
// creators, deliverables, files, activity log, the works).
export default function DeleteCampaignButton({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    const confirmed = window.confirm(
      `Delete "${campaignName}"? This permanently removes the campaign, all its creators, deliverables, files and activity — this cannot be undone.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        await deleteCampaign(campaignId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete campaign");
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 shadow-xs transition-all hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950/50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        <span>Delete</span>
      </button>
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
