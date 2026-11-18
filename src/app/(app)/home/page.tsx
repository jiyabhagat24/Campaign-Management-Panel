import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canViewRoleHome, isSuperAdmin } from "@/lib/rbac";
import { formatCompactINR } from "@/lib/format";
import { Kpi, PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";
import { ExceptionsCard, ExecutionSnapshotCard, PaymentPipelineCard, type Exception } from "@/components/management/Cards";
import { DAY_MS, cmName, creatorPaymentPipeline, executionSnapshot, isCreatorDelayed, loadCampaigns, openEscalationItems, quotedOf, riskReasons, type ScopeCampaign } from "@/lib/managementData";

// Role homes (sandbox audit, Phase 3) for Campaign Manager, Brand Solutions,
// Finance and Business Development. Each answers three questions first:
// what needs me, what is at risk, how is my area doing. New page; the
// existing /dashboard is unchanged.

const HOUR_MS = 60 * 60 * 1000;
const today = () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

type ClientInv = { campaignId: string; invoiceAmount: number; amountReceived: number | null; invoiceRaisedAt: Date | null; invoiceNumber: string | null };

async function clientInvoicesFor(ids: string[]) {
  return (await (prisma as any).clientInvoice.findMany({
    where: { campaignId: { in: ids } },
    select: { campaignId: true, invoiceAmount: true, amountReceived: true, invoiceRaisedAt: true, invoiceNumber: true },
  })) as ClientInv[];
}

function ageingReceivables(invs: ClientInv[], nameOf: Map<string, string>, now: number): Exception[] {
  return invs
    .filter((i) => i.invoiceAmount - (i.amountReceived ?? 0) > 0.5 && i.invoiceRaisedAt && now - i.invoiceRaisedAt.getTime() > 45 * DAY_MS)
    .map((i) => {
      const age = Math.floor((now - (i.invoiceRaisedAt as Date).getTime()) / DAY_MS);
      return {
        tone: age > 90 ? ("high" as const) : ("medium" as const),
        title: `${formatCompactINR(i.invoiceAmount - (i.amountReceived ?? 0))} receivable · ${nameOf.get(i.campaignId)}`,
        reason: `Invoice ${i.invoiceNumber ?? ""} raised ${age} days ago`,
        href: `/campaigns/${i.campaignId}`,
      };
    });
}

function atRiskItems(campaigns: ScopeCampaign[], now: number): Exception[] {
  return campaigns
    .filter((c) => c.status === "ACTIVE")
    .map((c) => ({ c, r: riskReasons(c, now, 0) }))
    .filter((x) => x.r.length)
    .map(({ c, r }) => ({ tone: r.length > 1 ? ("high" as const) : ("medium" as const), title: `${c.brand} · ${c.name}`, reason: `At risk: ${r.join(", ")} · CM ${cmName(c) ?? "not assigned"}`, href: `/campaigns/${c.id}` }));
}

async function ledgerInvoices(ids: string[]) {
  try {
    return (await (prisma as any).creatorInvoice.findMany({
      where: { campaignId: { in: ids }, status: { not: "REJECTED" } },
      select: {
        id: true, campaignId: true, amount: true, status: true, dueDate: true, cmApprovedAt: true, approvedTermsVersion: true,
        creator: { select: { name: true, paymentTerms: { select: { termsVersion: true } } } },
        payouts: { select: { amount: true } },
      },
    })) as { id: string; campaignId: string; amount: number; status: string; dueDate: Date | null; cmApprovedAt: Date | null; approvedTermsVersion: number | null; creator: { name: string; paymentTerms: { termsVersion: number } | null }; payouts: { amount: number }[] }[];
  } catch {
    return [];
  }
}

export default async function RoleHomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewRoleHome(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");
  const now = Date.now();
  const campaigns = await loadCampaigns({ ...campaignVisibilityWhere(user), status: { not: "CANCELLED" } });
  const ids = campaigns.map((c) => c.id);
  const nameOf = new Map(campaigns.map((c) => [c.id, `${c.brand} · ${c.name}`]));
  const active = campaigns.filter((c) => c.status === "ACTIVE");
  const onboarded = active.flatMap((c) => c.creators.filter((cr) => cr.status === "ONBOARDED").map((cr) => ({ ...cr, campaign: c })));
  const snap = executionSnapshot(onboarded.flatMap((cr) => cr.deliverables));

  // ---------- Campaign Manager ----------
  if (user.role === "CAMPAIGN_MANAGER") {
    const pricing = await prisma.creator.findMany({
      where: { campaignId: { in: ids }, internalCost: { not: null }, quotedCost: null, status: { notIn: ["REJECTED", "CLIENT_REJECTED"] } },
      select: { id: true, name: true, campaignId: true, createdAt: true, pricingQueueEnteredAt: true },
    });
    const invs = await ledgerInvoices(ids);
    const toApprove = invs.filter((i) => i.status === "VALIDATED" && (!i.cmApprovedAt || i.approvedTermsVersion !== i.creator.paymentTerms?.termsVersion));
    const clientHeld = onboarded.filter((cr) => cr.ballOwner === "CLIENT" && cr.deliverables.some((d) => !d.liveLink));
    const qc = onboarded.flatMap((cr) => cr.deliverables.filter((d) => d.contentStatus === "INTERNAL_APPROVAL").map(() => cr));
    const items: Exception[] = [
      ...pricing
        .map((p) => ({ p, h: (now - (p.pricingQueueEnteredAt ?? p.createdAt).getTime()) / HOUR_MS }))
        .sort((a, b) => b.h - a.h)
        .map(({ p, h }) => ({ tone: h >= 96 ? ("high" as const) : ("medium" as const), title: `Price ${p.name}`, reason: `${nameOf.get(p.campaignId)} · in pricing queue ${Math.round(h)}h`, href: "/pricing-queue" })),
      ...qc.map((cr) => ({ tone: "medium" as const, title: `QC video · ${cr.name}`, reason: `${cr.campaign.brand} · ${cr.campaign.name} · waiting on internal approval`, href: `/campaigns/${cr.campaign.id}` })),
      ...toApprove.map((i) => ({ tone: "medium" as const, title: `Approve invoice · ${i.creator.name}`, reason: `${nameOf.get(i.campaignId)} · ${formatCompactINR(i.amount)} validated by Finance`, href: "/finance-ledger" })),
      ...clientHeld.map((cr) => ({ tone: "medium" as const, title: `Chase client · ${cr.name}`, reason: `${cr.campaign.brand} · ${cr.campaign.name} · waiting on client approval`, href: "/action-tracker" })),
    ];
    const pipeline = await creatorPaymentPipeline(ids, campaigns, now);
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
        <PageHeadline title="Close campaigns on time." subtitle={`Your campaigns · ${today()}`} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi emphasis label="Active campaigns" value={active.length} hint={`${atRiskItems(campaigns, now).length} at risk`} />
          <Kpi label="Pricing queue" value={pricing.length} hint="Creators waiting for a quoted cost" />
          <Kpi label="Waiting on client" value={clientHeld.length} hint="Creators with client approvals pending" />
          <Kpi label="Invoices to approve" value={toApprove.length} hint="Validated by Finance, need your approval" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><ExceptionsCard title="Needs you" items={items} emptyText="Nothing waiting on you right now." /></div>
          <ExecutionSnapshotCard snap={snap} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><ExceptionsCard title="Campaigns at risk" items={atRiskItems(campaigns, now)} emptyText="None of your campaigns is at risk." /></div>
          <PaymentPipelineCard p={pipeline} href="/finance-ledger" />
        </div>
        <ExceptionsCard title="Open escalations" items={await openEscalationItems(ids, nameOf, now)} emptyText="No open escalations on your campaigns." />
      </div>
    );
  }

  // ---------- Finance ----------
  if (user.role === "FINANCE") {
    const invs = await ledgerInvoices(ids);
    const clientInvs = await clientInvoicesFor(ids);
    const paidOf = (i: (typeof invs)[number]) => i.payouts.reduce((s, p) => s + p.amount, 0);
    const toValidate = invs.filter((i) => i.status === "RECEIVED");
    const readyToPay = invs.filter((i) => i.status === "VALIDATED" && i.cmApprovedAt && i.approvedTermsVersion === i.creator.paymentTerms?.termsVersion && paidOf(i) + 0.5 < i.amount);
    const overdue = invs.filter((i) => i.dueDate && i.dueDate.getTime() < now && paidOf(i) + 0.5 < i.amount);
    const receivable = clientInvs.reduce((s, i) => s + i.invoiceAmount - (i.amountReceived ?? 0), 0);
    const pipeline = await creatorPaymentPipeline(ids, campaigns, now);
    const items: Exception[] = [
      ...overdue.map((i) => ({ tone: "high" as const, title: `Overdue creator invoice · ${i.creator.name}`, reason: `${nameOf.get(i.campaignId)} · ${formatCompactINR(i.amount - paidOf(i))} due since ${i.dueDate!.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`, href: "/finance-ledger" })),
      ...toValidate.map((i) => ({ tone: "medium" as const, title: `Validate invoice · ${i.creator.name}`, reason: `${nameOf.get(i.campaignId)} · ${formatCompactINR(i.amount)}`, href: "/finance-ledger" })),
      ...readyToPay.map((i) => ({ tone: "medium" as const, title: `Record payout · ${i.creator.name}`, reason: `${nameOf.get(i.campaignId)} · CM approved · ${formatCompactINR(i.amount - paidOf(i))} left`, href: "/finance-ledger" })),
      ...ageingReceivables(clientInvs, nameOf, now),
    ];
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
        <PageHeadline title="Receivables, payables and what's due." subtitle={`All campaigns · ${today()}`} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi emphasis label="Client receivable" value={formatCompactINR(receivable)} hint="Invoiced less received" />
          <Kpi label="Creator unpaid" value={formatCompactINR(pipeline.unpaid)} hint={pipeline.source === "ledger" ? "Logged invoices less payouts" : "From creator payout status"} />
          <Kpi label="Invoices to validate" value={toValidate.length} hint="Received, not yet checked" />
          <Kpi label="Ready to pay" value={readyToPay.length} hint="CM approved on current terms" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><ExceptionsCard title="Needs you" items={items} emptyText="No invoices to validate, payouts to record or ageing receivables." /></div>
          <PaymentPipelineCard p={pipeline} href="/finance-ledger" />
        </div>
        <ExceptionsCard title="Open escalations" items={await openEscalationItems(ids, nameOf, now)} emptyText="No open escalations." />
      </div>
    );
  }

  // ---------- Brand Solutions ----------
  if (user.role === "BRAND_SOLUTIONS") {
    const clientInvs = await clientInvoicesFor(ids);
    const reopen = await prisma.creator.findMany({
      where: { campaignId: { in: ids }, OR: [{ pendingQuotedCostEdit: { not: null } }, { pendingFinalCostEdit: { not: null } }] },
      select: { name: true, campaignId: true, pendingQuotedCostEditReason: true, pendingFinalCostEditReason: true },
    });
    const unassigned = campaigns.filter((c) => (c.status === "DRAFT" || c.status === "ASSIGNED") && !c.teamMembers.some((t) => t.roleOnCampaign === "CAMPAIGN_MANAGER"));
    const booked = onboarded.reduce((s, cr) => s + quotedOf(cr), 0);
    const receivable = clientInvs.reduce((s, i) => s + i.invoiceAmount - (i.amountReceived ?? 0), 0);
    const items: Exception[] = [
      ...reopen.map((r) => ({ tone: "high" as const, title: `Approve cost reopen · ${r.name}`, reason: `${nameOf.get(r.campaignId)} · ${r.pendingFinalCostEditReason ?? r.pendingQuotedCostEditReason ?? "reason not given"}`, href: `/campaigns/${r.campaignId}` })),
      ...unassigned.map((c) => ({ tone: "medium" as const, title: `${c.brand} · ${c.name}`, reason: `No Campaign Manager assigned yet · created ${Math.floor((now - c.createdAt.getTime()) / DAY_MS)}d ago`, href: `/campaigns/${c.id}` })),
      ...ageingReceivables(clientInvs, nameOf, now),
    ];
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
        <PageHeadline title="From strategy to execution." subtitle={`Your clients and campaigns · ${today()}`} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi emphasis label="Booked value" value={formatCompactINR(booked)} hint={`${active.length} active campaigns`} />
          <Kpi label="Client receivable" value={formatCompactINR(receivable)} hint="Invoiced less received" />
          <Kpi label="Cost reopen requests" value={reopen.length} hint="Need your approval" />
          <Kpi label="Without a CM" value={unassigned.length} hint="Draft or assigned campaigns" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><ExceptionsCard title="Needs you" items={items} emptyText="No approvals, unassigned campaigns or ageing receivables." /></div>
          <ExecutionSnapshotCard snap={snap} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ExceptionsCard title="Campaigns at risk" items={atRiskItems(campaigns, now)} emptyText="None of your campaigns is at risk." />
          <ExceptionsCard title="Open escalations" items={await openEscalationItems(ids, nameOf, now)} emptyText="No open escalations for your clients." />
        </div>
      </div>
    );
  }

  // ---------- IR Executive (own book) ----------
  if (user.role === "IR_EXECUTIVE") {
    const myCreators = onboarded.filter((cr) => cr.pocUserId === user.id);
    const mySnap = executionSnapshot(myCreators.flatMap((cr) => cr.deliverables));
    const delayed = myCreators.filter((cr) => isCreatorDelayed(cr, now));
    const pipeline = await creatorPaymentPipeline(ids, campaigns, now);
    const items: Exception[] = delayed.map((cr) => ({ tone: "high" as const, title: `Past deadline · ${cr.name}`, reason: `${cr.campaign.brand} · ${cr.campaign.name} · not all deliverables live`, href: `/campaigns/${cr.campaign.id}` }));
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
        <PageHeadline title="Your creators. Your next move." subtitle={`Your book · ${today()} · your full worklist stays on the Dashboard`} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi emphasis label="Creators you run" value={myCreators.length} hint="You're the execution SPOC" />
          <Kpi label="Delayed" value={delayed.length} hint="Past deadline, not all live" />
          <Kpi label="Live" value={`${mySnap.live} / ${mySnap.total}`} hint="Your deliverables" />
          <Kpi label="Campaigns" value={active.length} hint="Active, you're assigned" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><ExceptionsCard title="Needs you" items={items} emptyText="None of your creators is past deadline." /></div>
          <ExecutionSnapshotCard snap={mySnap} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><ExceptionsCard title="Open escalations" items={await openEscalationItems(ids, nameOf, now)} emptyText="No open escalations on your campaigns." /></div>
          <PaymentPipelineCard p={pipeline} href="/finance-ledger" />
        </div>
      </div>
    );
  }

  // ---------- Business Development ----------
  const clientInvs = await clientInvoicesFor(ids);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline title="Your briefs and client pipeline." subtitle={`Campaigns you're on · ${today()}`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="Campaigns" value={campaigns.length} hint={`${active.length} active`} />
        <Kpi label="In pipeline" value={campaigns.filter((c) => c.status === "DRAFT" || c.status === "ASSIGNED").length} hint="Draft or assigned" />
        <Kpi label="Deliverables live" value={`${snap.live} / ${snap.total}`} hint="On active campaigns" />
        <Kpi label="Client balance due" value={formatCompactINR(clientInvs.reduce((s, i) => s + i.invoiceAmount - (i.amountReceived ?? 0), 0))} hint="Invoiced less received" />
      </div>
      <SandboxCard title="Campaign progress" footer="Internal creator costs are not shown to Business Development.">
        <table className="w-full table-fixed text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={`w-[34%] ${thClass}`}>Campaign</th>
              <th className={`w-[16%] ${thClass}`}>Status</th>
              <th className={`w-[25%] ${thClass}`}>Delivery</th>
              <th className={`w-[25%] ${thClass}`}>Client invoices</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {campaigns.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">You're not assigned to any campaign yet.</td></tr>
            )}
            {campaigns.map((c) => {
              const dels = c.creators.filter((cr) => cr.status === "ONBOARDED").flatMap((cr) => cr.deliverables);
              const live = dels.filter((d) => d.liveLink).length;
              const inv = clientInvs.filter((i) => i.campaignId === c.id);
              const invoiced = inv.reduce((s, i) => s + i.invoiceAmount, 0);
              const received = inv.reduce((s, i) => s + (i.amountReceived ?? 0), 0);
              const delayed = c.creators.filter((cr) => isCreatorDelayed(cr, now)).length;
              return (
                <tr key={c.id} className="align-top">
                  <td className="px-5 py-3">
                    <Link href={`/campaigns/${c.id}`} className="block truncate font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">{c.name}</Link>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c.brand} · CM {cmName(c) ?? "not assigned"}</p>
                  </td>
                  <td className="px-5 py-3 text-xs font-semibold capitalize text-slate-700 dark:text-slate-300">{c.status.replace("_", " ").toLowerCase()}</td>
                  <td className="px-5 py-3">
                    <p className="text-slate-700 dark:text-slate-300">{live} of {dels.length} live</p>
                    {delayed > 0 && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{delayed} creator{delayed === 1 ? "" : "s"} delayed</p>}
                  </td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                    <p>{formatCompactINR(invoiced)} invoiced</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatCompactINR(invoiced - received)} due</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SandboxCard>
    </div>
  );
}
