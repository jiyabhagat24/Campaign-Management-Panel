"use server";

// Creator payment chain actions (sandbox audit, Phase 1). New file — nothing
// in actions.ts changes. Flow:
//   CM sets the payment schedule (milestones)  -> CM confirms it
//   Finance verifies the vendor
//   IR / CM / Finance logs the creator's invoice
//   Finance validates the invoice              -> CM approves it for payment
//   Finance records payouts against milestones
// Guard: an approval only counts for the terms version it was given on, and
// every payout re-checks schedule confirmation, vendor verification and
// amounts at the moment it is recorded.
// Each step writes a WorkflowEvent and an in-app, actionable notification
// for whoever owns the next step (no email is sent from here).

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, isSuperAdmin } from "@/lib/rbac";
import type { Role } from "@/lib/constants";

type Result = { error?: string };
const db = prisma as any; // new tables; local Prisma client may not be regenerated yet

const can = {
  setTerms: (r: Role) => r === "CAMPAIGN_MANAGER" || r === "CXO",
  finance: (r: Role) => r === "FINANCE" || r === "CXO",
  logInvoice: (r: Role) => ["IR_EXECUTIVE", "IR_MANAGER", "CAMPAIGN_MANAGER", "FINANCE", "CXO"].includes(r),
  approve: (r: Role) => r === "CAMPAIGN_MANAGER" || r === "CXO",
};

async function actor() {
  const user = await requireUser();
  return { ...user, superAdmin: isSuperAdmin(user.id) };
}

async function creatorInScope(user: { id: string; role: Role }, creatorId: string) {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { id: true, name: true, campaignId: true, status: true } });
  if (!creator) return null;
  const campaign = await prisma.campaign.findFirst({ where: { id: creator.campaignId, ...campaignVisibilityWhere(user) }, select: { id: true, name: true } });
  return campaign ? { ...creator, campaignName: campaign.name } : null;
}

async function usersOnCampaign(campaignId: string, role: string) {
  const rows = await prisma.campaignTeamMember.findMany({ where: { campaignId, roleOnCampaign: role }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

async function financeUsers() {
  const rows = await prisma.user.findMany({ where: { role: "FINANCE" }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function record(params: {
  campaignId: string;
  creatorId: string;
  entityType: string;
  entityId: string;
  fromStage: string | null;
  toStage: string;
  actorUserId: string;
  nextOwners: string[];
  waitingOn: "INTERNAL" | "CREATOR" | "CLIENT";
  title: string;
  body: string;
  actionRequired: string;
}) {
  try {
    await db.workflowEvent.create({
      data: {
        campaignId: params.campaignId,
        creatorId: params.creatorId,
        entityType: params.entityType,
        entityId: params.entityId,
        fromStage: params.fromStage,
        toStage: params.toStage,
        actorUserId: params.actorUserId,
        ownerUserId: params.nextOwners[0] ?? null,
        waitingOn: params.waitingOn,
      },
    });
    const recipients = params.nextOwners.filter((id) => id !== params.actorUserId);
    if (recipients.length) {
      await db.notification.createMany({
        data: recipients.map((userId) => ({
          userId,
          channel: "INSTANT",
          title: params.title,
          body: params.body,
          entityType: params.entityType,
          entityId: params.entityId,
          actionRequired: params.actionRequired,
        })),
      });
    }
  } catch {
    // Logging must never block the money action itself.
  }
}

function done() {
  revalidatePath("/finance-ledger");
  return {};
}

// ---- Terms & schedule ----

export async function saveCreatorPaymentSchedule(
  creatorId: string,
  milestones: { label: string; amount: number; dueDate: string | null }[]
): Promise<Result> {
  const user = await actor();
  if (!can.setTerms(user.role) && !user.superAdmin) return { error: "Only the Campaign Manager sets payment schedules." };
  const creator = await creatorInScope(user, creatorId);
  if (!creator) return { error: "Creator not found in your campaigns." };
  const clean = milestones
    .map((m, i) => ({ label: m.label.trim(), amount: Number(m.amount), dueDate: m.dueDate ? new Date(m.dueDate) : null, sortOrder: i }))
    .filter((m) => m.label && m.amount > 0);
  if (clean.length === 0) return { error: "Add at least one milestone with a name and an amount." };

  try {
    const paidOnMilestones = await db.creatorPayout.count({ where: { milestone: { creatorId } } });
    if (paidOnMilestones > 0) return { error: "Payouts are already recorded against this schedule; it can't be replaced." };
    const existing = await db.creatorPaymentTerms.findUnique({ where: { creatorId } });
    await db.$transaction([
      db.paymentMilestone.deleteMany({ where: { creatorId } }),
      db.paymentMilestone.createMany({ data: clean.map((m) => ({ ...m, creatorId })) }),
      existing
        ? db.creatorPaymentTerms.update({
            where: { creatorId },
            data: { termsVersion: existing.termsVersion + 1, scheduleConfirmedAt: null, scheduleConfirmedById: null },
          })
        : db.creatorPaymentTerms.create({ data: { creatorId } }),
    ]);
  } catch {
    return { error: "Couldn't save. The database may still need the new payment tables (npx prisma db push)." };
  }
  await record({
    campaignId: creator.campaignId, creatorId, entityType: "CreatorPaymentTerms", entityId: creatorId,
    fromStage: null, toStage: "SCHEDULE_PENDING_CONFIRMATION", actorUserId: user.id,
    nextOwners: await usersOnCampaign(creator.campaignId, "CAMPAIGN_MANAGER"), waitingOn: "INTERNAL",
    title: `Confirm payment schedule · ${creator.name}`, body: `${creator.campaignName}: the schedule changed and needs confirmation.`,
    actionRequired: "CONFIRM_SCHEDULE",
  });
  return done();
}

export async function confirmCreatorPaymentSchedule(creatorId: string): Promise<Result> {
  const user = await actor();
  if (!can.setTerms(user.role) && !user.superAdmin) return { error: "Only the Campaign Manager confirms payment schedules." };
  const creator = await creatorInScope(user, creatorId);
  if (!creator) return { error: "Creator not found in your campaigns." };
  const terms = await db.creatorPaymentTerms.findUnique({ where: { creatorId } }).catch(() => null);
  if (!terms) return { error: "Set a payment schedule first." };
  await db.creatorPaymentTerms.update({ where: { creatorId }, data: { scheduleConfirmedAt: new Date(), scheduleConfirmedById: user.id } });
  return done();
}

export async function saveCreatorVendor(creatorId: string, vendorName: string, vendorReference: string): Promise<Result> {
  const user = await actor();
  if (!can.setTerms(user.role) && !can.finance(user.role) && !user.superAdmin) return { error: "You can't edit vendor details." };
  const creator = await creatorInScope(user, creatorId);
  if (!creator) return { error: "Creator not found in your campaigns." };
  try {
    const existing = await db.creatorPaymentTerms.findUnique({ where: { creatorId } });
    const data = {
      vendorName: vendorName.trim() || null,
      vendorReference: vendorReference.trim() || null,
      vendorVerified: false,
      vendorVerifiedAt: null,
      vendorVerifiedById: null,
    };
    if (existing) await db.creatorPaymentTerms.update({ where: { creatorId }, data: { ...data, termsVersion: existing.termsVersion + 1 } });
    else await db.creatorPaymentTerms.create({ data: { creatorId, ...data } });
  } catch {
    return { error: "Couldn't save. The database may still need the new payment tables (npx prisma db push)." };
  }
  await record({
    campaignId: creator.campaignId, creatorId, entityType: "CreatorPaymentTerms", entityId: creatorId,
    fromStage: null, toStage: "VENDOR_PENDING_VERIFICATION", actorUserId: user.id,
    nextOwners: await financeUsers(), waitingOn: "INTERNAL",
    title: `Verify vendor · ${creator.name}`, body: `${creator.campaignName}: vendor details changed.`, actionRequired: "VERIFY_VENDOR",
  });
  return done();
}

export async function verifyCreatorVendor(creatorId: string): Promise<Result> {
  const user = await actor();
  if (!can.finance(user.role) && !user.superAdmin) return { error: "Only Finance verifies vendors." };
  const creator = await creatorInScope(user, creatorId);
  if (!creator) return { error: "Creator not found." };
  const terms = await db.creatorPaymentTerms.findUnique({ where: { creatorId } }).catch(() => null);
  if (!terms?.vendorName) return { error: "Add vendor details first." };
  await db.creatorPaymentTerms.update({ where: { creatorId }, data: { vendorVerified: true, vendorVerifiedAt: new Date(), vendorVerifiedById: user.id } });
  return done();
}

// ---- Invoices ----

export async function logCreatorInvoice(input: { creatorId: string; invoiceNumber: string; amount: number; dueDate: string | null; fileUrl: string }): Promise<Result> {
  const user = await actor();
  if (!can.logInvoice(user.role) && !user.superAdmin) return { error: "You can't log creator invoices." };
  const creator = await creatorInScope(user, input.creatorId);
  if (!creator) return { error: "Creator not found in your campaigns." };
  if (creator.status !== "ONBOARDED") return { error: "Only onboarded creators can invoice." };
  const amount = Number(input.amount);
  if (!(amount > 0)) return { error: "Enter the invoice amount." };
  let invoice: { id: string };
  try {
    invoice = await db.creatorInvoice.create({
      data: {
        creatorId: creator.id,
        campaignId: creator.campaignId,
        invoiceNumber: input.invoiceNumber.trim() || null,
        amount,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        fileUrl: input.fileUrl.trim() || null,
        createdById: user.id,
      },
    });
  } catch {
    return { error: "Couldn't save. The database may still need the new payment tables (npx prisma db push)." };
  }
  await record({
    campaignId: creator.campaignId, creatorId: creator.id, entityType: "CreatorInvoice", entityId: invoice.id,
    fromStage: null, toStage: "RECEIVED", actorUserId: user.id, nextOwners: await financeUsers(), waitingOn: "INTERNAL",
    title: `Validate invoice · ${creator.name}`, body: `${creator.campaignName}: ₹${amount.toLocaleString("en-IN")} invoice received.`,
    actionRequired: "VALIDATE_INVOICE",
  });
  return done();
}

async function invoiceInScope(user: { id: string; role: Role }, invoiceId: string) {
  const inv = await db.creatorInvoice.findUnique({ where: { id: invoiceId }, include: { payouts: true } }).catch(() => null);
  if (!inv) return null;
  const creator = await creatorInScope(user, inv.creatorId);
  return creator ? { inv, creator } : null;
}

export async function validateCreatorInvoice(invoiceId: string, ok: boolean, reason?: string): Promise<Result> {
  const user = await actor();
  if (!can.finance(user.role) && !user.superAdmin) return { error: "Only Finance validates invoices." };
  const found = await invoiceInScope(user, invoiceId);
  if (!found) return { error: "Invoice not found." };
  const { inv, creator } = found;
  if (inv.status !== "RECEIVED") return { error: "This invoice has already been processed." };
  if (!ok && !reason?.trim()) return { error: "Say why the invoice is rejected." };
  await db.creatorInvoice.update({
    where: { id: inv.id },
    data: ok
      ? { status: "VALIDATED", validatedAt: new Date(), validatedById: user.id }
      : { status: "REJECTED", rejectReason: reason!.trim(), validatedAt: new Date(), validatedById: user.id },
  });
  await record({
    campaignId: creator.campaignId, creatorId: creator.id, entityType: "CreatorInvoice", entityId: inv.id,
    fromStage: "RECEIVED", toStage: ok ? "VALIDATED" : "REJECTED", actorUserId: user.id,
    nextOwners: ok ? await usersOnCampaign(creator.campaignId, "CAMPAIGN_MANAGER") : inv.createdById ? [inv.createdById] : [],
    waitingOn: ok ? "INTERNAL" : "CREATOR",
    title: ok ? `Approve invoice for payment · ${creator.name}` : `Invoice rejected · ${creator.name}`,
    body: ok ? `${creator.campaignName}: Finance validated the invoice.` : `${creator.campaignName}: ${reason}`,
    actionRequired: ok ? "APPROVE_INVOICE" : "CORRECT_INVOICE",
  });
  return done();
}

export async function approveCreatorInvoice(invoiceId: string): Promise<Result> {
  const user = await actor();
  if (!can.approve(user.role) && !user.superAdmin) return { error: "Only the Campaign Manager approves invoices for payment." };
  const found = await invoiceInScope(user, invoiceId);
  if (!found) return { error: "Invoice not found." };
  const { inv, creator } = found;
  if (inv.status !== "VALIDATED") return { error: "Finance must validate the invoice first." };
  const terms = await db.creatorPaymentTerms.findUnique({ where: { creatorId: creator.id } });
  if (!terms?.scheduleConfirmedAt) return { error: "Confirm the creator's payment schedule before approving." };
  await db.creatorInvoice.update({
    where: { id: inv.id },
    data: { cmApprovedAt: new Date(), cmApprovedById: user.id, approvedTermsVersion: terms.termsVersion },
  });
  await record({
    campaignId: creator.campaignId, creatorId: creator.id, entityType: "CreatorInvoice", entityId: inv.id,
    fromStage: "VALIDATED", toStage: "CM_APPROVED", actorUserId: user.id, nextOwners: await financeUsers(), waitingOn: "INTERNAL",
    title: `Ready to pay · ${creator.name}`, body: `${creator.campaignName}: CM approved the invoice for payment.`, actionRequired: "RECORD_PAYOUT",
  });
  return done();
}

// ---- Payouts ----

export async function recordCreatorPayout(input: { invoiceId: string; milestoneId: string | null; amount: number; paidAt: string; reference: string; proofUrl: string }): Promise<Result> {
  const user = await actor();
  if (!can.finance(user.role) && !user.superAdmin) return { error: "Only Finance records payouts." };
  const found = await invoiceInScope(user, input.invoiceId);
  if (!found) return { error: "Invoice not found." };
  const { inv, creator } = found;
  const amount = Number(input.amount);
  if (!(amount > 0)) return { error: "Enter the amount paid." };

  // Re-check everything now, not at approval time.
  const terms = await db.creatorPaymentTerms.findUnique({ where: { creatorId: creator.id } });
  if (inv.status !== "VALIDATED") return { error: "Invoice is not validated." };
  if (!inv.cmApprovedAt) return { error: "Campaign Manager hasn't approved this invoice yet." };
  if (!terms?.scheduleConfirmedAt) return { error: "The payment schedule changed and isn't confirmed. Ask the CM to confirm it." };
  if (inv.approvedTermsVersion !== terms.termsVersion) return { error: "Terms or vendor changed after approval. The CM must approve this invoice again." };
  if (!terms.vendorVerified) return { error: "Vendor isn't verified." };

  const paidOnInvoice = inv.payouts.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
  if (paidOnInvoice + amount > inv.amount + 0.5) return { error: `Only ₹${(inv.amount - paidOnInvoice).toLocaleString("en-IN")} is left on this invoice.` };

  if (input.milestoneId) {
    const ms = await db.paymentMilestone.findUnique({ where: { id: input.milestoneId }, include: { payouts: true } });
    if (!ms || ms.creatorId !== creator.id) return { error: "That milestone doesn't belong to this creator." };
    const paidOnMs = ms.payouts.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
    if (paidOnMs + amount > ms.amount + 0.5) return { error: `Only ₹${(ms.amount - paidOnMs).toLocaleString("en-IN")} is left on "${ms.label}".` };
  }

  const payout = await db.creatorPayout.create({
    data: {
      invoiceId: inv.id,
      milestoneId: input.milestoneId,
      amount,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      reference: input.reference.trim() || null,
      proofUrl: input.proofUrl.trim() || null,
      recordedById: user.id,
    },
  });
  await record({
    campaignId: creator.campaignId, creatorId: creator.id, entityType: "CreatorPayout", entityId: payout.id,
    fromStage: "CM_APPROVED", toStage: paidOnInvoice + amount >= inv.amount - 0.5 ? "PAID" : "PART_PAID", actorUserId: user.id,
    nextOwners: await usersOnCampaign(creator.campaignId, "CAMPAIGN_MANAGER"), waitingOn: "INTERNAL",
    title: `Payout recorded · ${creator.name}`, body: `${creator.campaignName}: ₹${amount.toLocaleString("en-IN")} paid.`, actionRequired: "NONE",
  });
  return done();
}
