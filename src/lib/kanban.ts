import { KANBAN_COLUMN_LABELS, type KanbanColumn } from "@/lib/constants";

// Rolls a campaign up to whichever of the 3 macro columns (Shortlist /
// Onboarding / Report) it's furthest along in, based on its creators: no one
// onboarded yet = Shortlist; onboarded but nothing live yet = Onboarding; at
// least one live deliverable = Report. Shared by the dashboard, campaigns
// list, and pipeline board so they never disagree with each other.
export function campaignColumn(creators: { status: string; deliverables: { liveLink: string | null }[] }[]): KanbanColumn {
  const onboarded = creators.filter((c) => c.status === "ONBOARDED");
  if (onboarded.length === 0) return "SHORTLIST";
  const anyLive = onboarded.some((c) => c.deliverables.some((d) => d.liveLink));
  return anyLive ? "REPORT" : "ONBOARDING";
}

export function campaignColumnLabel(creators: { status: string; deliverables: { liveLink: string | null }[] }[]): string {
  return KANBAN_COLUMN_LABELS[campaignColumn(creators)];
}
