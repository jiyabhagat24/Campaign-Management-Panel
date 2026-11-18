import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canViewFinanceLedger, isSuperAdmin } from "@/lib/rbac";
import FinanceLedgerClient, { type LedgerCreator } from "@/components/finance/FinanceLedgerClient";

// Finance ledger (sandbox audit, Phase 1). New page built on the new payment
// tables; the existing Creator Payouts table and Client Cash stay as they are.

export default async function FinanceLedgerPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewFinanceLedger(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");

  const campaigns = await prisma.campaign.findMany({
    where: { ...campaignVisibilityWhere(user), status: { notIn: ["CANCELLED"] } },
    select: { id: true, name: true, brand: true },
  });
  const campaignIds = campaigns.map((c) => c.id);
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  const clientInvoices = (await (prisma as any).clientInvoice.findMany({
    where: { campaignId: { in: campaignIds } },
    select: { campaignId: true, invoiceAmount: true, amountReceived: true },
  })) as { campaignId: string; invoiceAmount: number; amountReceived: number | null }[];
  const clientCash = new Map<string, { invoiced: number; received: number }>();
  for (const ci of clientInvoices) {
    const agg = clientCash.get(ci.campaignId) ?? { invoiced: 0, received: 0 };
    agg.invoiced += ci.invoiceAmount;
    agg.received += ci.amountReceived ?? 0;
    clientCash.set(ci.campaignId, agg);
  }

  let tablesReady = true;
  let creators: any[] = [];
  try {
    creators = await (prisma as any).creator.findMany({
      where: { campaignId: { in: campaignIds }, status: "ONBOARDED" },
      select: {
        id: true,
        name: true,
        channelHandle: true,
        campaignId: true,
        internalCost: true,
        paymentTerms: true,
        paymentMilestones: { orderBy: { sortOrder: "asc" }, include: { payouts: { select: { amount: true } } } },
        creatorInvoices: { orderBy: { createdAt: "desc" }, include: { payouts: { orderBy: { paidAt: "desc" } } } },
      },
      orderBy: { name: "asc" },
    });
  } catch {
    tablesReady = false;
    creators = (
      await prisma.creator.findMany({
        where: { campaignId: { in: campaignIds }, status: "ONBOARDED" },
        select: { id: true, name: true, channelHandle: true, campaignId: true, internalCost: true },
        orderBy: { name: "asc" },
      })
    ).map((c) => ({ ...c, paymentTerms: null, paymentMilestones: [], creatorInvoices: [] }));
  }

  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  const rows: LedgerCreator[] = creators.map((c) => {
    const camp = campaignById.get(c.campaignId);
    const cash = clientCash.get(c.campaignId) ?? { invoiced: 0, received: 0 };
    const t = c.paymentTerms;
    return {
      id: c.id,
      name: c.name,
      handle: c.channelHandle,
      campaignId: c.campaignId,
      campaignName: camp?.name ?? "",
      brand: camp?.brand ?? "",
      internalCost: c.internalCost,
      clientPayment: cash.invoiced === 0 ? "NOT_INVOICED" : cash.received <= 0 ? "NOT_RECEIVED" : cash.received + 0.5 < cash.invoiced ? "PARTIAL" : "RECEIVED",
      terms: t
        ? {
            vendorName: t.vendorName,
            vendorReference: t.vendorReference,
            vendorVerified: t.vendorVerified,
            termsVersion: t.termsVersion,
            scheduleConfirmed: Boolean(t.scheduleConfirmedAt),
          }
        : null,
      milestones: c.paymentMilestones.map((m: any) => ({
        id: m.id,
        label: m.label,
        amount: m.amount,
        dueDate: iso(m.dueDate),
        paid: m.payouts.reduce((s: number, p: any) => s + p.amount, 0),
      })),
      invoices: c.creatorInvoices.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        dueDate: iso(inv.dueDate),
        fileUrl: inv.fileUrl,
        status: inv.status,
        rejectReason: inv.rejectReason,
        cmApproved: Boolean(inv.cmApprovedAt),
        approvalCurrent: Boolean(inv.cmApprovedAt) && t?.termsVersion === inv.approvedTermsVersion,
        payouts: inv.payouts.map((p: any) => ({ id: p.id, amount: p.amount, paidAt: iso(p.paidAt) as string, reference: p.reference, proofUrl: p.proofUrl, milestoneId: p.milestoneId })),
      })),
    };
  });

  return (
    <FinanceLedgerClient
      creators={rows}
      role={user.role}
      tablesReady={tablesReady}
      todayIso={new Date().toISOString()}
    />
  );
}
