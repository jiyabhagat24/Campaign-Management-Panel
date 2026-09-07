"use client";

import { useState, useTransition } from "react";
import { updateCampaignStatus } from "@/lib/actions";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/lib/constants";

// Shared by the dashboard's Campaign Table and the Campaigns Directory's
// Action column — same control, same behavior, one definition. Swapping the
// value calls updateCampaignStatus (a "use server" action) and relies on its
// revalidatePath calls to refresh the page on next navigation. useTransition
// keeps the select interactive (not blocked) while the request is in flight,
// and reverts on failure.
const COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300",
  HOLD: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300",
  COMPLETED: "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950/50 dark:border-sky-800 dark:text-sky-300",
  CANCELLED: "bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
};

export default function CampaignStatusSelect({ campaignId, status }: { campaignId: string; status: string }) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        startTransition(() => {
          updateCampaignStatus(campaignId, next).catch(() => setValue(status));
        });
      }}
      className={`rounded-lg border px-2 py-1 text-[11px] font-bold uppercase tracking-wide outline-none disabled:opacity-50 ${COLORS[value] ?? COLORS.ACTIVE}`}
    >
      {CAMPAIGN_STATUSES.map((s) => (
        <option key={s} value={s}>
          {CAMPAIGN_STATUS_LABELS[s as CampaignStatus]}
        </option>
      ))}
    </select>
  );
}
