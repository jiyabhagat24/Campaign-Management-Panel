// Gap build: briefs, campaign gates, working-hours clock.
import { fake } from "./helpers/setup";
import { signIn } from "./helpers/setup";
import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./helpers/fixtures";
import { canReleaseFor, closureChecks, allPass } from "@/lib/gates";
import { workingHoursBetween } from "@/lib/workingHours";

let B: typeof import("@/lib/briefActions");
let G: typeof import("@/lib/gateActions");
before(async () => {
  B = await import("@/lib/briefActions");
  G = await import("@/lib/gateActions");
});

function seedMore() {
  const db = seed();
  db.users.push({ id: "bs", name: "Rhea", role: "BRAND_SOLUTIONS" }, { id: "bs2", name: "Kunal", role: "BRAND_SOLUTIONS" }, { id: "irm", name: "Meera", role: "IR_MANAGER" }, { id: "intern", name: "Ira", role: "IR_INTERN" });
  db.members.push({ campaignId: "c1", userId: "bs", roleOnCampaign: "BRAND_SOLUTIONS" });
  Object.assign(db.campaigns[0], { status: "ACTIVE", reportPublished: false });
  Object.assign(db.creators[0], { pocUserId: "ire" });
  db.deliverables.push({ id: "d1", creatorId: "cr1", platform: "YOUTUBE_LONG", scriptStatus: "SENT_FOR_APPROVAL", contentStatus: null, liveLink: null, lastTrackedAt: null });
  return db;
}

describe("gate rules", () => {
  test("shoot needs an approved script, publishing needs an approved video", () => {
    const d: any = { id: "x", scriptStatus: "FEEDBACK", contentStatus: null, liveLink: null, lastTrackedAt: null, releases: [] as { kind: string }[] };
    assert.equal(canReleaseFor("SHOOT", d).ok, false);
    d.scriptStatus = "APPROVED";
    assert.equal(canReleaseFor("SHOOT", d).ok, true);
    assert.equal(canReleaseFor("PUBLISH", d).ok, false);
    d.contentStatus = "APPROVED";
    assert.equal(canReleaseFor("PUBLISH", d).ok, true);
    d.releases.push({ kind: "PUBLISH" });
    assert.equal(canReleaseFor("PUBLISH", d).ok, false, "a gate is released once");
  });
  test("closure needs everything live, tracked once, and the report published", () => {
    const c: any = { status: "ACTIVE", reportPublished: false, creators: [{ status: "ONBOARDED", deliverables: [{ id: "a", scriptStatus: "APPROVED", contentStatus: "APPROVED", liveLink: "https://y", lastTrackedAt: null }] }] };
    assert.deepEqual(closureChecks(c).filter((x) => !x.ok).map((x) => x.key), ["tracked", "report"]);
    c.reportPublished = true;
    (c.creators[0].deliverables[0] as any).lastTrackedAt = new Date();
    assert.equal(allPass(closureChecks(c)), true);
    c.creators.push({ status: "REJECTED", deliverables: [{ id: "b", scriptStatus: null, contentStatus: null, liveLink: null, lastTrackedAt: null }] });
    assert.equal(allPass(closureChecks(c)), true, "rejected creators don't block closure");
  });
});

describe("working-hours clock", () => {
  test("counts Monday–Friday 11:00–19:00 IST only", () => {
    // Fri 2026-11-20 17:00 IST = 11:30 UTC; Mon 2026-11-23 12:00 IST = 06:30 UTC
    assert.equal(workingHoursBetween(new Date("2026-11-20T11:30:00Z"), new Date("2026-11-23T06:30:00Z")), 3);
    assert.equal(workingHoursBetween(new Date("2026-11-21T05:00:00Z"), new Date("2026-11-22T12:00:00Z")), 0, "weekend");
  });
});

describe("briefs & strategy", () => {
  beforeEach(() => seedMore());

  test("BD posts, BS picks up, asks, BD answers, BS links the campaign", async () => {
    const db = fake._db;
    signIn("bd");
    const r = await B.createBrief({ title: "Festive launch", brand: "Atomberg", expectedCpv: 0.8 });
    assert.ok(r.id);
    assert.ok(db.notifications.some((n: any) => n.userId === "bs" && n.actionRequired === "Review brief"));
    signIn("bs");
    assert.deepEqual(await B.startBrief(r.id!), {});
    signIn("bs2");
    assert.match((await B.startBrief(r.id!)).error!, /already working/);
    signIn("bs");
    await B.postBriefMessage(r.id!, "Which regions?", "QUESTION");
    assert.equal(db.briefs[0].status, "CLARIFICATION");
    signIn("bd");
    await B.postBriefMessage(r.id!, "South India", "ANSWER");
    assert.equal(db.briefs[0].status, "IN_PROGRESS");
    signIn("bs");
    assert.deepEqual(await B.linkBriefCampaign(r.id!, "c1"), {});
    assert.equal(db.briefs[0].status, "FULFILLED");
    assert.ok(db.notifications.some((n: any) => n.userId === "irm" && n.actionRequired === "Assign team"), "IR Manager is asked to assign the team");
    assert.ok(db.briefMessages.filter((m: any) => m.kind === "STATUS").length >= 4, "every status change is logged");
  });

  test("access: CXO, CM and interns can't post; BS can't link a campaign it isn't on", async () => {
    for (const u of ["cxo", "cm", "intern"]) {
      signIn(u);
      assert.ok((await B.createBrief({ title: "x", brand: "y" })).error, `${u} must not post`);
    }
    signIn("bd");
    const r = await B.createBrief({ title: "x", brand: "y" });
    signIn("bd");
    assert.ok((await B.startBrief(r.id!)).error, "BD doesn't work briefs");
    signIn("bs2");
    await B.startBrief(r.id!);
    assert.match((await B.linkBriefCampaign(r.id!, "c1")).error!, /assigned/);
    assert.match((await B.postBriefMessage(r.id!, "hi", "ANSWER")).error!, /author/);
    assert.match((await B.setBriefOutcome(r.id!, "LOST", "")).error!, /reason/);
  });
});

describe("campaign gates", () => {
  beforeEach(() => seedMore());

  test("only the campaign's CM releases, and only after approval", async () => {
    const db = fake._db;
    signIn("cm");
    assert.match((await G.releaseDeliverable("d1", "SHOOT")).error!, /not approved/);
    db.deliverables[0].scriptStatus = "APPROVED";
    signIn("cm2");
    assert.match((await G.releaseDeliverable("d1", "SHOOT")).error!, /not the Campaign Manager/);
    signIn("ire");
    assert.ok((await G.releaseDeliverable("d1", "SHOOT")).error);
    signIn("cm");
    assert.deepEqual(await G.releaseDeliverable("d1", "SHOOT"), {});
    assert.ok(db.notifications.some((n: any) => n.userId === "ire" && n.actionRequired === "Brief creator to shoot"));
    assert.ok(db.activity.some((a: any) => a.action === "RELEASED_FOR_SHOOT"));
    assert.match((await G.releaseDeliverable("d1", "SHOOT")).error!, /Already/);
  });

  test("closure: CM closes execution, Finance signs off, campaign closes only when checks pass", async () => {
    const db = fake._db;
    signIn("cm");
    assert.match((await G.closeExecution("c1")).error!, /Not ready/);
    Object.assign(db.deliverables[0], { liveLink: "https://youtu.be/x", lastTrackedAt: new Date() });
    db.campaigns[0].reportPublished = true;
    signIn("fin");
    assert.match((await G.financeSignOff("c1")).error!, /close execution first/);
    signIn("cm");
    assert.deepEqual(await G.closeExecution("c1"), {});
    assert.equal(db.campaigns[0].status, "ACTIVE", "still open until Finance signs");
    signIn("cm");
    assert.match((await G.financeSignOff("c1")).error!, /Only Finance/);
    signIn("fin");
    assert.deepEqual(await G.financeSignOff("c1"), {});
    assert.equal(db.campaigns[0].status, "CLOSED");
    assert.ok(db.activity.some((a: any) => a.action === "CAMPAIGN_CLOSED" && JSON.parse(a.meta).from === "ACTIVE"));
    assert.ok(db.notifications.some((n: any) => n.userId === "cxo" && /closed/i.test(n.title)));
  });

  test("Finance sign-off is refused if a check stopped passing after execution closed", async () => {
    const db = fake._db;
    Object.assign(db.deliverables[0], { liveLink: "https://youtu.be/x", lastTrackedAt: new Date() });
    db.campaigns[0].reportPublished = true;
    signIn("cm");
    await G.closeExecution("c1");
    db.deliverables.push({ id: "d2", creatorId: "cr1", platform: "INSTAGRAM_REEL", scriptStatus: null, contentStatus: null, liveLink: null, lastTrackedAt: null });
    signIn("fin");
    assert.match((await G.financeSignOff("c1")).error!, /no longer pass/);
    assert.equal(db.campaigns[0].status, "ACTIVE");
  });
});

describe("gap pages follow the access matrix", async () => {
  const R = await import("@/lib/rbac");
  test("who sees what", () => {
    assert.equal(R.reportingShowsCpv("IR_INTERN" as any), false, "G3: no quoted-cost figures for interns");
    assert.equal(R.canSeeActivityTrail("CLIENT" as any), false, "G9: no team activity trail for clients");
    assert.equal(R.canViewCampaignGates("CLIENT" as any), false);
    assert.deepEqual(["BUSINESS_DEVELOPMENT", "BRAND_SOLUTIONS", "CXO", "CAMPAIGN_MANAGER", "IR_MANAGER"].map((r) => R.canViewBriefs(r as any)), [true, true, true, false, false]);
    assert.deepEqual(["CXO", "CAMPAIGN_MANAGER", "FINANCE"].map((r) => R.canReleaseDeliverables(r as any)), [false, true, false], "CXO writes only the month lock");
    assert.equal(R.canFinanceSignOff("FINANCE" as any), true);
    assert.equal(R.canViewClientInvoices("CLIENT" as any), true);
    assert.equal(R.canViewClientInvoices("BRAND_SOLUTIONS" as any), false);
  });
});
