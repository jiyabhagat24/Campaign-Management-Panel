// Cross-role journey for the creator payment chain:
// CM schedule -> CM confirm -> vendor -> Finance verify -> IRE logs invoice
// -> Finance validates -> CM approves -> Finance pays (part, then rest).
// Plus the changed-approval cases the sandbox audit found.
import { fake, signIn } from "./helpers/setup";
import { seed } from "./helpers/fixtures";
import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

let A: typeof import("@/lib/creatorPaymentActions");
before(async () => {
  A = await import("@/lib/creatorPaymentActions");
});

async function readyInvoice() {
  signIn("cm");
  assert.deepEqual(await A.saveCreatorPaymentSchedule("cr1", [
    { label: "Advance", amount: 40000, dueDate: null },
    { label: "Final settlement", amount: 60000, dueDate: null },
  ]), {});
  assert.deepEqual(await A.confirmCreatorPaymentSchedule("cr1"), {});
  assert.deepEqual(await A.saveCreatorVendor("cr1", "Kabir Shah Media", "ABCDE1234F"), {});
  signIn("fin");
  assert.deepEqual(await A.verifyCreatorVendor("cr1"), {});
  signIn("ire");
  assert.deepEqual(await A.logCreatorInvoice({ creatorId: "cr1", invoiceNumber: "KS-01", amount: 100000, dueDate: null, fileUrl: "" }), {});
  const inv = fake._db.invoices[0];
  signIn("fin");
  assert.deepEqual(await A.validateCreatorInvoice(inv.id, true), {});
  signIn("cm");
  assert.deepEqual(await A.approveCreatorInvoice(inv.id), {});
  return inv;
}
const ms = (label: string) => fake._db.milestones.find((m: any) => m.label === label).id;
const pay = (invoiceId: string, milestoneId: string | null, amount: number) =>
  A.recordCreatorPayout({ invoiceId, milestoneId, amount, paidAt: "2026-11-18", reference: "UTR1", proofUrl: "" });

describe("creator payment journey", () => {
  beforeEach(() => seed());

  test("happy path: part-payment then final payment against milestones", async () => {
    const inv = await readyInvoice();
    signIn("fin");
    assert.deepEqual(await pay(inv.id, ms("Advance"), 40000), {});
    assert.deepEqual(await pay(inv.id, ms("Final settlement"), 60000), {});
    assert.equal(fake._db.payouts.length, 2);
    // Every handoff left a workflow event and the next owner got an actionable notification.
    assert.ok(fake._db.events.some((e: any) => e.toStage === "PAID"));
    assert.ok(fake._db.notifications.some((n: any) => n.userId === "cm" && n.actionRequired === "APPROVE_INVOICE"));
    assert.ok(fake._db.notifications.some((n: any) => n.userId === "fin" && n.actionRequired === "RECORD_PAYOUT"));
  });

  test("schedule changed after approval blocks payout until CM confirms and re-approves", async () => {
    const inv = await readyInvoice();
    signIn("cm");
    await A.saveCreatorPaymentSchedule("cr1", [{ label: "Final settlement", amount: 100000, dueDate: null }]);
    signIn("fin");
    assert.match((await pay(inv.id, null, 10000)).error ?? "", /schedule changed/i);
    signIn("cm");
    await A.confirmCreatorPaymentSchedule("cr1");
    signIn("fin");
    assert.match((await pay(inv.id, null, 10000)).error ?? "", /approve this invoice again/i);
    signIn("cm");
    assert.deepEqual(await A.approveCreatorInvoice(inv.id), {});
    signIn("fin");
    assert.deepEqual(await pay(inv.id, null, 10000), {});
  });

  test("editing a verified vendor blocks payout", async () => {
    const inv = await readyInvoice();
    signIn("cm");
    await A.saveCreatorVendor("cr1", "New Vendor LLP", "ZZZZZ9999Z");
    signIn("fin");
    const res = await pay(inv.id, null, 10000);
    assert.ok(res.error, "payout must be refused after a vendor edit");
  });

  test("cannot pay more than a milestone or the invoice", async () => {
    const inv = await readyInvoice();
    signIn("fin");
    assert.match((await pay(inv.id, ms("Advance"), 40001)).error ?? "", /left on "Advance"/);
    assert.match((await pay(inv.id, null, 100001)).error ?? "", /left on this invoice/);
  });

  test("rejecting an invoice needs a reason and notifies whoever logged it", async () => {
    signIn("ire");
    await A.logCreatorInvoice({ creatorId: "cr1", invoiceNumber: "KS-02", amount: 5000, dueDate: null, fileUrl: "" });
    const inv = fake._db.invoices[0];
    signIn("fin");
    assert.ok((await A.validateCreatorInvoice(inv.id, false, "")).error);
    assert.deepEqual(await A.validateCreatorInvoice(inv.id, false, "Wrong GST number"), {});
    assert.ok(fake._db.notifications.some((n: any) => n.userId === "ire" && n.actionRequired === "CORRECT_INVOICE"));
  });

  test("approval and payout are refused out of order", async () => {
    signIn("ire");
    await A.logCreatorInvoice({ creatorId: "cr1", invoiceNumber: "KS-03", amount: 5000, dueDate: null, fileUrl: "" });
    const inv = fake._db.invoices[0];
    signIn("cm");
    assert.match((await A.approveCreatorInvoice(inv.id)).error ?? "", /validate/i);
    signIn("fin");
    assert.ok((await pay(inv.id, null, 100)).error);
  });

  test("roles can only do their own step", async () => {
    signIn("ire");
    await A.logCreatorInvoice({ creatorId: "cr1", invoiceNumber: "KS-04", amount: 5000, dueDate: null, fileUrl: "" });
    const inv = fake._db.invoices[0];
    assert.ok((await A.validateCreatorInvoice(inv.id, true)).error, "IRE cannot validate");
    assert.ok((await A.saveCreatorPaymentSchedule("cr1", [{ label: "x", amount: 1, dueDate: null }])).error, "IRE cannot set schedule");
    signIn("bd");
    assert.ok((await A.logCreatorInvoice({ creatorId: "cr1", invoiceNumber: "", amount: 1, dueDate: null, fileUrl: "" })).error, "BD cannot log invoices");
  });

  test("a CM not on the campaign can't touch its creators", async () => {
    signIn("cm2");
    assert.match((await A.saveCreatorPaymentSchedule("cr1", [{ label: "Final", amount: 1, dueDate: null }])).error ?? "", /not found/i);
  });

  test("schedule is locked once a payout exists", async () => {
    const inv = await readyInvoice();
    signIn("fin");
    await pay(inv.id, ms("Advance"), 1000);
    signIn("cm");
    assert.match((await A.saveCreatorPaymentSchedule("cr1", [{ label: "New", amount: 5, dueDate: null }])).error ?? "", /can't be replaced/);
  });
});
