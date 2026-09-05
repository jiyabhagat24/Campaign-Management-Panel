import { STAGE_LABELS, STAGE_OWNER, type Stage } from "@/lib/constants";

const OWNER_COLOR: Record<string, string> = {
  TBM: "bg-blue-50 text-blue-700",
  CLIENT: "bg-amber-50 text-amber-700",
  AUTO: "bg-emerald-50 text-emerald-700",
};

export default function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`badge ${OWNER_COLOR[STAGE_OWNER[stage]]}`}>{STAGE_LABELS[stage]}</span>
  );
}
