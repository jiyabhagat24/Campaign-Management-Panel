import { DEFAULT_SLA } from "@/lib/constants";

export type SlaConfig = {
  slaClientFeedbackHours: number;
  slaScriptFromCreatorDays: number;
  slaContentFromCreatorDays: number;
  slaOnboardToGoLiveDays: number;
};

export const defaultSlaConfig: SlaConfig = {
  slaClientFeedbackHours: DEFAULT_SLA.clientFeedbackHours,
  slaScriptFromCreatorDays: DEFAULT_SLA.scriptFromCreatorDays,
  slaContentFromCreatorDays: DEFAULT_SLA.contentFromCreatorDays,
  slaOnboardToGoLiveDays: DEFAULT_SLA.onboardToGoLiveDays,
};

// Simplified two-counter clock (brief slide 15):
// - totalDays: calendar time since onboarding (what the client sees)
// - tbmOwnedDays: same, minus time sitting in client-owned stages
//   (CLIENT_REVIEW, NEGOTIATE, ONBOARD, PRODUCT). Escalations should fire on
//   this counter only. This MVP computes it from onboardedAt + stage-owner
//   table; a production build should track stage-transition timestamps in
//   ActivityLog for full accuracy per creator/deliverable.
import { STAGE_OWNER, type Stage } from "@/lib/constants";

export function daysSince(date: Date | null | undefined) {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function isGoLiveAtRisk(goLiveDeadline: Date | null | undefined) {
  if (!goLiveDeadline) return false;
  const daysLeft = Math.floor((new Date(goLiveDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return daysLeft <= 2 && daysLeft >= 0;
}

export function isGoLiveBreached(goLiveDeadline: Date | null | undefined) {
  if (!goLiveDeadline) return false;
  return new Date(goLiveDeadline).getTime() < Date.now();
}

export function stageOwnerLabel(stage: Stage) {
  return STAGE_OWNER[stage];
}
