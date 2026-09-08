"use client";

import { useState } from "react";
import { updateCampaignBrief } from "@/lib/actions";
import { Pencil } from "lucide-react";

// Brief is optional at campaign creation, so this lets it be filled in or
// edited afterward right on the campaign page — same click-to-edit pattern
// as FinanceRow. canEdit mirrors canCreateCampaign server-side.
export default function BriefEditor({ campaignId, initial, canEdit }: { campaignId: string; initial: string | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [brief, setBrief] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);

  if (!editing) {
    if (!brief) {
      return canEdit ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-500 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
        >
          <Pencil className="h-3 w-3" />
          Add brief
        </button>
      ) : null;
    }
    return (
      <div className="mt-2 max-w-2xl">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-400">{brief}</p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400"
          >
            <Pencil className="h-3 w-3" />
            Edit brief
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await updateCampaignBrief(campaignId, brief);
          setEditing(false);
        } finally {
          setSaving(false);
        }
      }}
      className="mt-2 max-w-2xl space-y-2"
    >
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={4}
        autoFocus
        placeholder="Objective, mandatories, timelines..."
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setBrief(initial ?? "");
            setEditing(false);
          }}
          className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
