"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteCampaign } from "@/lib/actions";

// Hard delete from the Campaigns Directory — irreversible, so this confirms
// with the campaign's own name before calling the server action. On
// success, router.refresh() re-fetches the directory's server data, which
// now simply omits the deleted row.
export default function DeleteCampaignButton({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  return (
    <button
      type="button"
      disabled={deleting}
      onClick={async () => {
        if (!window.confirm(`Permanently delete "${campaignName}"? This removes every creator, deliverable, and activity log under it — it cannot be undone.`)) return;
        setDeleting(true);
        try {
          const result = await deleteCampaign(campaignId);
          if (result?.error) {
            window.alert(result.error);
            setDeleting(false);
            return;
          }
          router.refresh();
        } catch (err: any) {
          window.alert(err?.message ?? "Failed to delete this campaign.");
          setDeleting(false);
        }
      }}
      title="Delete campaign"
      className="inline-flex flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 shadow-xs transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
