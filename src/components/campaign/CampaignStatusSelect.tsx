"use client";

import { useState, useTransition } from "react";
import { updateCampaignStatus } from "@/lib/actions";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/lib/constants";

// Shared by the dashboard's Campaign Table and the Campaigns Directory's
// Action column — same control, same behavior, one definition. Swapping the
// value calls updateCampaignStatus (a "use server" action) and relies on its
// revalidatePath calls to refresh the page on next navigation. The select
// value updates immediately (optimistic) and reverts on failure; it's
// deliberately never disabled while the action is in flight — a Server
// Action that calls revalidatePath doesn't resolve until Next finishes
// re-rendering the whole page's server data, which can take a noticeable
// moment on data-heavy pages, and disabling the control for that entire
// window is what made every dropdown in the app feel slow to use even
// though the value itself was already updating instantly.
const COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
  ASSIGNED: "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300",
  ACTIVE: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300",
  ON_HOLD: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300",
  CLOSED: "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950/50 dark:border-sky-800 dark:text-sky-300",
  CANCELLED: "bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
};

// DRAFT and ASSIGNED are automatic (spec State Machine) — never offered as a
// manual pick, even though the campaign might currently be sitting in one of
// them (a fresh/unassigned campaign). The current value still renders with
// its own color via the COLORS map above even when it's not one of the
// selectable options.
const SELECTABLE_STATUSES = CAMPAIGN_STATUSES.filter((s) => s !== "DRAFT" && s !== "ASSIGNED");

export default function CampaignStatusSelect({ campaignId, status }: { campaignId: string; status: string }) {
  const [value, setValue] = useState(status);
  const [, startTransition] = useTransition();

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        // ACTIVE -> ON_HOLD requires a logged reason (spec) — ask for it
        // right here rather than building a separate modal for one field.
        let reason: string | undefined;
        if (next === "ON_HOLD") {
          reason = window.prompt("Reason for putting this campaign on hold:") ?? undefined;
          if (!reason || !reason.trim()) return; // cancelled/empty — leave the dropdown as-is
        }
        setValue(next);
        startTransition(() => {
          updateCampaignStatus(campaignId, next, reason).catch(() => setValue(status));
        });
      }}
      className={`rounded-lg border px-2 py-1 text-[11px] font-bold uppercase tracking-wide outline-none disabled:opacity-50 ${COLORS[value] ?? COLORS.ACTIVE}`}
    >
      {!SELECTABLE_STATUSES.includes(value as (typeof SELECTABLE_STATUSES)[number]) && (
        <option value={value}>{CAMPAIGN_STATUS_LABELS[value as CampaignStatus] ?? value}</option>
      )}
      {SELECTABLE_STATUSES.map((s) => (
        <option key={s} value={s}>
          {CAMPAIGN_STATUS_LABELS[s as CampaignStatus]}
        </option>
      ))}
    </select>
  );
}
