import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeInternalCost, campaignVisibilityWhere, isClient } from "@/lib/rbac";
import CreatorPayoutsTable, { type PayoutCreatorRow } from "@/components/finance/CreatorPayoutsTable";
import ClientInvoicingTable, { type ClientInvoicingRow } from "@/components/finance/ClientInvoicingTable";
import { PLATFORM_SHORT_LABELS, FINANCE_VISIBLE_STATUSES, type Platform } from "@/lib/constants";

// The sheet's "Finance Table — Detailed Finance report" tab, marked
// "Separate page" there — so it's its own route rather than a dashboard
// section. Gated the same way the campaign page's Finance section is
// (canSeeInternalCost): every internal role except the client. Data itself
// is further scoped to campaigns the user is assigned to (campaignVisibilityWhere),
// except CXO who sees every campaign's finance data.
export default async function FinancePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (isClient(user.role) || !canSeeInternalCost(user.role)) redirect("/dashboard");

  // Same assignment scoping as everywhere else: CXO sees every campaign's
  // finance data, everyone else only sees campaigns they're a team member
  // on. Also restricted to ACTIVE/COMPLETED campaigns — a paused or
  // cancelled campaign's payouts/invoicing shouldn't show up here
  // (FINANCE_VISIBLE_STATUSES, same rule as the dashboard's Finance Table).
  const campaigns = await prisma.campaign.findMany({
    where: { ...campaignVisibilityWhere(user), status: { in: FINANCE_VISIBLE_STATUSES } },
    include: {
      creators: {
        select: {
          id: true,
          name: true,
          status: true,
          onboardedAt: true,
          internalCost: true,
          payoutInvoiceRaised: true,
          payoutInvoiceReceived: true,
          payoutPaymentStatus: true,
          payoutAdvance: true,
          payoutRemark: true,
          deliverables: { select: { id: true, platform: true, liveLink: true } },
        },
      },
      teamMembers: { include: { user: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Finance & Invoicing — Section A, Creator side payouts. One row per
  // ONBOARDED creator across every campaign (not filtered by date range —
  // this is a payout worklist, not a closure report). Content Status
  // mirrors the Onboarding board's own Live/Not live definition: any
  // deliverable with a liveLink counts the creator as Live.
  const payoutRows: PayoutCreatorRow[] = campaigns.flatMap((c) =>
    c.creators
      .filter((cr) => cr.status === "ONBOARDED")
      .map((cr) => ({
        id: cr.id,
        campaignId: c.id,
        name: cr.name,
        deliverables: cr.deliverables.map((d) => PLATFORM_SHORT_LABELS[d.platform as Platform] ?? d.platform),
        live: cr.deliverables.some((d) => !!d.liveLink),
        payoutAmount: cr.internalCost,
        payoutInvoiceRaised: cr.payoutInvoiceRaised,
        payoutInvoiceReceived: cr.payoutInvoiceReceived,
        payoutPaymentStatus: cr.payoutPaymentStatus,
        payoutAdvance: cr.payoutAdvance,
        payoutRemark: cr.payoutRemark,
      }))
  );

  // Finance & Invoicing — Section B, Client side. budgetQuoted doubles as
  // "Final Closed Cost" (same number, no separate field — see schema
  // comment on financeInvoiced).
  const invoicingRows: ClientInvoicingRow[] = campaigns.map((c) => ({
    id: c.id,
    brand: c.brand,
    name: c.name,
    finalClosedCost: c.budgetQuoted,
    invoiced: c.financeInvoiced,
  }));

  return (
    <div className="p-8 space-y-10 max-w-7xl mx-auto">
      <div className="border-b border-slate-200/60 dark:border-slate-800 pb-6">
        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-100 rounded-full px-2.5 py-0.5 dark:bg-rose-950/80 dark:border-rose-800/80 dark:text-rose-300">
          TheBoredMonkey eyes only
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Finance and Invoicing</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Two sides tracked separately: money out to creators, and money in from the client.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">A. Creator side, payouts (TBM eyes only)</h3>
          <CreatorPayoutsTable rows={payoutRows} />
        </div>

        <div>
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">B. Client side, invoicing</h3>
          <ClientInvoicingTable rows={invoicingRows} />
        </div>
      </div>
    </div>
  );
}
