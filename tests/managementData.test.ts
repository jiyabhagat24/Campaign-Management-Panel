// Metric definitions used by the management homes.
import "./helpers/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { executionSnapshot, isCreatorDelayed, riskReasons, lastMonths } from "@/lib/managementData";

const DAY = 86400000;
const now = Date.UTC(2026, 10, 18);

test("execution snapshot buckets each deliverable once", () => {
  const s = executionSnapshot([
    { scriptStatus: null, contentStatus: null, liveLink: null },
    { scriptStatus: "APPROVED", contentStatus: "IN_SHOOT", liveLink: null },
    { scriptStatus: "APPROVED", contentStatus: "APPROVED", liveLink: null },
    { scriptStatus: "APPROVED", contentStatus: "APPROVED", liveLink: "https://x" },
  ]);
  assert.deepEqual(s, { script: 1, video: 1, ready: 1, live: 1, total: 4 });
});

test("a creator is delayed only when onboarded, past deadline and not all live", () => {
  const base = { status: "ONBOARDED", onboardedAt: null, goLiveDeadline: new Date(now - DAY) };
  assert.equal(isCreatorDelayed({ ...base, deliverables: [{ liveLink: null }] }, now), true);
  assert.equal(isCreatorDelayed({ ...base, deliverables: [{ liveLink: "https://x" }] }, now), false);
  assert.equal(isCreatorDelayed({ ...base, status: "SHORTLISTED", deliverables: [{ liveLink: null }] }, now), false);
  assert.equal(isCreatorDelayed({ ...base, goLiveDeadline: new Date(now + DAY), deliverables: [{ liveLink: null }] }, now), false);
});

test("at-risk always comes with a stated reason", () => {
  const c: any = {
    goLiveDeadline: new Date(now - DAY),
    creators: [
      { status: "ONBOARDED", onboardedAt: null, goLiveDeadline: new Date(now - DAY), ballOwner: "CLIENT", deliverables: [{ liveLink: null }] },
      { status: "ONBOARDED", onboardedAt: null, goLiveDeadline: new Date(now + DAY), ballOwner: "CLIENT", deliverables: [{ liveLink: null }] },
    ],
  };
  const r = riskReasons(c, now, 1);
  assert.ok(r.includes("1 creator past go-live"));
  assert.ok(r.includes("campaign go-live date passed"));
  assert.ok(r.includes("1 high escalation"));
  assert.ok(r.includes("2 creators waiting on client"));
});

test("month window is the last N calendar months, oldest first", () => {
  const m = lastMonths(3, new Date(2026, 0, 15));
  assert.deepEqual(m.map((x) => x.key), ["2025-11", "2025-12", "2026-01"]);
});
