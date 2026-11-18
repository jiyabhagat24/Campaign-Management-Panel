// Campaign gate rules (gap build). Pure functions so they can be tested.
//
// Release gates (Campaign Manager):
//   Release for shoot      needs the script approved
//   Release for publishing needs the video approved
// Closure checks (spec State Machine, Campaign Active -> Closed, and Field
// Ownership: report cannot publish until every live deliverable has had one
// tracking refresh):
//   campaign is Active
//   every deliverable on onboarded creators is live
//   every live deliverable has been tracked at least once
//   the report is published

export type GateDeliverable = {
  id: string;
  scriptStatus: string | null;
  contentStatus: string | null;
  liveLink: string | null;
  lastTrackedAt: Date | null;
  releases?: { kind: string }[];
};

export function canReleaseFor(kind: "SHOOT" | "PUBLISH", d: GateDeliverable): { ok: boolean; reason?: string } {
  const done = (d.releases ?? []).some((r) => r.kind === kind);
  if (done) return { ok: false, reason: "Already released" };
  if (kind === "SHOOT") return d.scriptStatus === "APPROVED" ? { ok: true } : { ok: false, reason: "Script not approved yet" };
  if (!(d.releases ?? []).some((r) => r.kind === "SHOOT") && d.scriptStatus !== "APPROVED") return { ok: false, reason: "Not released for shoot" };
  return d.contentStatus === "APPROVED" ? { ok: true } : { ok: false, reason: "Video not approved yet" };
}

export type ClosureCheck = { key: string; label: string; ok: boolean; detail: string };

export function closureChecks(c: {
  status: string;
  reportPublished: boolean;
  creators: { status: string; deliverables: GateDeliverable[] }[];
}): ClosureCheck[] {
  const dels = c.creators.filter((cr) => cr.status === "ONBOARDED").flatMap((cr) => cr.deliverables);
  const live = dels.filter((d) => d.liveLink);
  const untracked = live.filter((d) => !d.lastTrackedAt);
  return [
    { key: "active", label: "Campaign is active", ok: c.status === "ACTIVE" || c.status === "CLOSED", detail: `Status: ${c.status.replace("_", " ").toLowerCase()}` },
    { key: "live", label: "Deliverables resolved", ok: dels.length > 0 && live.length === dels.length, detail: `${live.length} of ${dels.length} live` },
    { key: "tracked", label: "Every live deliverable tracked", ok: live.length > 0 && untracked.length === 0, detail: untracked.length ? `${untracked.length} not refreshed yet` : "All refreshed at least once" },
    { key: "report", label: "Final report published", ok: c.reportPublished, detail: c.reportPublished ? "Published" : "Not published yet" },
  ];
}

export function allPass(checks: ClosureCheck[]) {
  return checks.every((x) => x.ok);
}
