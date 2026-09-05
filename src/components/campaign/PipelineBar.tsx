"use client";

import { STAGES, STAGE_LABELS, STAGE_OWNER, type Stage } from "@/lib/constants";
import { advanceCampaignStage } from "@/lib/actions";

const OWNER_COLOR: Record<string, string> = {
  TBM: "border-blue-400 bg-blue-50 text-blue-700",
  CLIENT: "border-amber-400 bg-amber-50 text-amber-700",
  AUTO: "border-emerald-400 bg-emerald-50 text-emerald-700",
};

export default function PipelineBar({ campaignId, currentStage, canEdit }: { campaignId: string; currentStage: Stage; canEdit: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-3">
      {STAGES.map((stage, i) => {
        const isCurrent = stage === currentStage;
        const isPast = STAGES.indexOf(currentStage) > i;
        return (
          <button
            key={stage}
            disabled={!canEdit}
            onClick={() => advanceCampaignStage(campaignId, stage)}
            title={`${STAGE_LABELS[stage]} — ${STAGE_OWNER[stage]} owns the clock`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              isCurrent
                ? OWNER_COLOR[STAGE_OWNER[stage]] + " ring-2 ring-offset-1 ring-brand/30"
                : isPast
                ? "border-slate-200 bg-slate-100 text-slate-500"
                : "border-slate-200 bg-white text-slate-400"
            } ${canEdit ? "hover:opacity-80" : "cursor-default"}`}
          >
            {i + 1}. {STAGE_LABELS[stage]}
          </button>
        );
      })}
    </div>
  );
}
