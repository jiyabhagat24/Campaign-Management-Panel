import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewLeadershipHome, isSuperAdmin } from "@/lib/rbac";
import { formatCompactINR } from "@/lib/format";
import { Kpi, PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";
import { ExceptionsCard, ExecutionSnapshotCard, PaymentPipelineCard, StatGrid, type Exception } from "@/components/management/Cards";
import {
  DAY_MS,
  creatorPaymentPipeline,
  executionSnapshot,
  isCreatorDelayed,
  lastMonths,
  loadCampaigns,
  lockedMonthKeys,
  monthKey,
  quotedOf,
  riskReasons,
} from "@/lib/managementData";

// C-suite home (sandbox audit, Phase 2). A company view — Business, Money,
// People, Outcomes — led by the exceptions that need leadership attention.
// New page; the existing /dashboard is unchanged.
//
// Definitions (kept distinct on purpose, per the audit):
//  Booked     = final quoted value of onboarded creators, non-cancelled campaigns
//  Invoiced   = client invoices raised          Collected = amount received
//  Receivable = invoiced − collected
//  Committed creator cost = internal cost of onboarded creators
//  Pending exposure = internal cost of creators still shortlisted/negotiating

const PENDING = ["SHORTLISTED", "CLIENT_LIKED", "CLIENT_NEGOTIATING"];
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

export default async function LeadershipHomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewLeadershipHome(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");

  const now = Date.now();
  const campaigns = await loadCampaigns({ status: { not: "CANCELLED" } });
  const ids = campaigns.map((c) => c.id);
  const nameOf = new Map(campaigns.map((c) => [c.id, `${c.brand} · ${c.name}`]));

  const [clientInvoices, escalations, staff] = await Promise.all([
    (prisma as any).clientInvoice.findMany({
      where: { campaignId: { in: ids } },
      select: { campaignId: true, invoiceAmount: true, amountReceived: true, invoiceRaisedAt: true, receivedAt: true, invoiceNumber: true },
    }) as Promise<{ campaignId: string; invoiceAmount: number; amountReceived: number | null; invoiceRaisedAt: Date | null; receivedAt: Date | null; invoiceNumber: string | null }[]>,
    prisma.escalation.findMany({
      where: { status: { not: "CLOSED" }, campaignId: { in: ids } },
      select: { id: true, title: true, severity: true, campaignId: true, createdAt: true, owner: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
  ]);

  const onboarded = campaigns.flatMap((c) => c.creators.filter((cr) => cr.status === "ONBOARDED").map((cr) => ({ ...cr, campaign: c })));
  const booked = onboarded.reduce((s, cr) => s + quotedOf(cr), 0);
  const committed = onboarded.reduce((s, cr) => s + (cr.internalCost ?? 0), 0);
  const pendingExposure = campaigns.flatMap((c) => c.creators.filter((cr) => PENDING.includes(cr.status))).reduce((s, cr) => s + (cr.internalCost ?? 0), 0);
  const invoiced = clientInvoices.reduce((s, i) => s + i.invoiceAmount, 0);
  const collected = clientInvoices.reduce((s, i) => s + (i.amountReceived ?? 0), 0);
  const margin = booked > 0 ? ((booked - committed) / booked) * 100 : null;

  // Business
  const active = campaigns.filter((c) => c.status === "ACTIVE");
  const pipeline = campaigns.filter((c) => c.status === "DRAFT" || c.status === "ASSIGNED");
  const byBrand = new Map<string, number>();
  for (const cr of onboarded) byBrand.set(cr.campaign.brand, (byBrand.get(cr.campaign.brand) ?? 0) + quotedOf(cr));
  const brandsSorted = [...byBrand.entries()].sort((a, b) => b[1] - a[1]);
  const topShare = booked > 0 && brandsSorted[0] ? (brandsSorted[0][1] / booked) * 100 : null;

  // People
  const roleCount = (r: string) => staff.find((s) => s.role === r)?._count._all ?? 0;
  const delayed = onboarded.filter((cr) => cr.campaign.status === "ACTIVE" && isCreatorDelayed(cr, now));
  const goLiveDays = onboarded
    .filter((cr) => cr.onboardedAt && now - cr.onboardedAt.getTime() < 90 * DAY_MS)
    .map((cr) => {
      const lives = cr.deliverables.map((d) => d.liveDate).filter((d): d is Date => Boolean(d));
      return lives.length ? (Math.min(...lives.map((d) => d.getTime())) - (cr.onboardedAt as Date).getTime()) / DAY_MS : null;
    })
    .filter((d): d is number => d !== null && d >= 0);
  const avgGoLive = goLiveDays.length ? goLiveDays.reduce((a, b) => a + b, 0) / goLiveDays.length : null;

  // Outcomes
  const dels = onboarded.flatMap((cr) => cr.deliverables);
  const snap = executionSnapshot(dels);
  // Formats are reported separately and never merged (workflow spec, step 23).
  const viewsBy = (platforms: string[]) =>
    dels.filter((d) => d.liveLink && platforms.includes(d.platform)).reduce((s, d) => s + (d.views ?? 0), 0);
  const locked = await lockedMonthKeys();

  // Exceptions — what needs leadership attention, each with its reason.
  const highByCampaign = new Map<string, number>();
  for (const e of escalations) if ((e.severity ?? "").toUpperCase() === "HIGH") highByCampaign.set(e.campaignId, (highByCampaign.get(e.campaignId) ?? 0) + 1);
  const exceptions: Exception[] = [];
  for (const e of escalations.filter((e) => (e.severity ?? "").toUpperCase() === "HIGH")) {
    const age = Math.floor((now - e.createdAt.getTime()) / DAY_MS);
    exceptions.push({ tone: "high", title: e.title, reason: `High escalation · ${nameOf.get(e.campaignId)} · open ${age}d · owner ${e.owner?.name ?? "not assigned"}`, href: "/escalations" });
  }
  for (const c of active) {
    const reasons = riskReasons(c, now, 0);
    if (reasons.length) {
      const cm = c.teamMembers.find((t) => t.roleOnCampaign === "CAMPAIGN_MANAGER")?.user.name;
      exceptions.push({ tone: reasons.length > 1 ? "high" : "medium", title: `${c.brand} · ${c.name}`, reason: `At risk: ${reasons.join(", ")}${cm ? ` · CM ${cm}` : ""}`, href: `/campaigns/${c.id}` });
    }
  }
  for (const inv of clientInvoices) {
    const bal = inv.invoiceAmount - (inv.amountReceived ?? 0);
    if (bal > 0.5 && inv.invoiceRaisedAt && now - inv.invoiceRaisedAt.getTime() > 45 * DAY_MS) {
      const age = Math.floor((now - inv.invoiceRaisedAt.getTime()) / DAY_MS);
      exceptions.push({ tone: age > 90 ? "high" : "medium", title: `${formatCompactINR(bal)} receivable · ${nameOf.get(inv.campaignId)}`, reason: `Invoice ${inv.invoiceNumber ?? ""} raised ${age} days ago`, href: `/campaigns/${inv.campaignId}` });
    }
  }
  exceptions.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "high" ? -1 : 1));

  const pipelineCash = await creatorPaymentPipeline(ids, campaigns, now);

  // Brand × month — booked by onboarding month (same convention as the
  // existing revenue chart) plus a collected row by receipt month.
  const months = lastMonths(6);
  const monthSet = new Set(months.map((m) => m.key));
  const grid = new Map<string, Map<string, number>>();
  for (const cr of onboarded) {
    if (!cr.onboardedAt) continue;
    const k = monthKey(cr.onboardedAt);
    if (!monthSet.has(k)) continue;
    const row = grid.get(cr.campaign.brand) ?? new Map<string, number>();
    row.set(k, (row.get(k) ?? 0) + quotedOf(cr));
    grid.set(cr.campaign.brand, row);
  }
  const brandRows = [...grid.entries()]
    .map(([brand, row]) => ({ brand, row, total: [...row.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const collectedByMonth = new Map<string, number>();
  for (const inv of clientInvoices) {
    if (!inv.receivedAt || !(inv.amountReceived ?? 0)) continue;
    const k = monthKey(inv.receivedAt);
    if (monthSet.has(k)) collectedByMonth.set(k, (collectedByMonth.get(k) ?? 0) + (inv.amountReceived ?? 0));
  }
  const cell = (n: number | undefined) => (n ? formatCompactINR(n) : "—");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline
        title="The organisation, at a glance."
        subtitle={`Company performance · finance figures are provisional until each month is locked · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="Booked value" value={formatCompactINR(booked)} hint={`${onboarded.length} onboarded creators · ${campaigns.length} campaigns`} />
        <Kpi label="Cash collected" value={formatCompactINR(collected)} hint={`of ${formatCompactINR(invoiced)} invoiced`} />
        <Kpi label="Client receivable" value={formatCompactINR(invoiced - collected)} hint="Invoiced less received" />
        <Kpi label="Committed margin" value={pct(margin)} hint={`${formatCompactINR(pendingExposure)} creator cost still in negotiation`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ExceptionsCard title="Needs leadership attention" items={exceptions} emptyText="No high escalations, at-risk campaigns or ageing receivables right now." />
        </div>
        <ExecutionSnapshotCard snap={snap} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SandboxCard title="Business" footer={brandsSorted[0] ? `Largest brand: ${brandsSorted[0][0]}.` : undefined}>
          <StatGrid
            items={[
              { label: "Active campaigns", value: String(active.length) },
              { label: "In pipeline", value: String(pipeline.length), hint: "Draft or assigned" },
              { label: "Brands booked", value: String(byBrand.size) },
              { label: "Top brand share", value: pct(topShare), hint: "Concentration of booked value" },
            ]}
          />
        </SandboxCard>
        <SandboxCard title="Money" footer="Booked, invoiced, collected and committed cost are kept separate.">
          <StatGrid
            items={[
              { label: "Invoiced", value: formatCompactINR(invoiced), hint: `${formatCompactINR(Math.max(booked - invoiced, 0))} booked, not yet invoiced` },
              { label: "Collected", value: formatCompactINR(collected) },
              { label: "Committed creator cost", value: formatCompactINR(committed) },
              { label: "Creator unpaid", value: formatCompactINR(pipelineCash.unpaid) },
            ]}
          />
        </SandboxCard>
        <SandboxCard
          title="People"
          aside={
            <Link href="/team-turnaround" className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
              Team & turnaround →
            </Link>
          }
        >
          <StatGrid
            items={[
              { label: "Campaign managers", value: String(roleCount("CAMPAIGN_MANAGER")) },
              { label: "IR team", value: String(roleCount("IR_MANAGER") + roleCount("IR_EXECUTIVE") + roleCount("IR_INTERN")) },
              { label: "Delayed creators", value: String(delayed.length), hint: "Go-live passed, not all live" },
              { label: "Open escalations", value: String(escalations.length), hint: `${[...highByCampaign.values()].reduce((a, b) => a + b, 0)} high` },
            ]}
          />
        </SandboxCard>
        <SandboxCard title="Outcomes" footer="Views come from the API only and each format is kept separate. CPV is per campaign on its report, from the quoted cost of live deliverables. Views alone don't prove sales ROI.">
          <StatGrid
            items={[
              { label: "Deliverables live", value: `${snap.live} / ${snap.total}` },
              { label: "Avg. onboard → first live", value: avgGoLive === null ? "—" : `${avgGoLive.toFixed(1)}d`, hint: "Creators onboarded in last 90 days" },
              { label: "Long form views", value: viewsBy(["YOUTUBE_LONG"]).toLocaleString("en-IN") },
              { label: "Shorts views", value: viewsBy(["YOUTUBE_SHORTS"]).toLocaleString("en-IN") },
              { label: "Reels views", value: viewsBy(["INSTAGRAM_REEL"]).toLocaleString("en-IN") },
              { label: "Posts & stories views", value: viewsBy(["INSTAGRAM_POST", "INSTAGRAM_STORY"]).toLocaleString("en-IN") },
            ]}
          />
        </SandboxCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SandboxCard title="Booked value by brand, month on month" footer="Booked = final quoted value, counted in the month the creator was onboarded. Collected = client receipts by the month received. Top 8 brands. Months marked provisional are not locked yet (Gate G12) and can still change after the Accounts audit.">
            <table className="w-full table-fixed text-sm">
              <thead className={theadClass}>
                <tr>
                  <th className={`w-[22%] ${thClass}`}>Brand</th>
                  {months.map((m) => (
                    <th key={m.key} className="px-2 py-2.5 text-right">
                      {m.label}
                      {!locked.has(m.key) && <span className="block text-[9px] font-semibold normal-case text-amber-600 dark:text-amber-400">provisional</span>}
                    </th>
                  ))}
                  <th className="px-5 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {brandRows.length === 0 && (
                  <tr>
                    <td colSpan={months.length + 2} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">
                      No creators onboarded in the last six months.
                    </td>
                  </tr>
                )}
                {brandRows.map((b) => (
                  <tr key={b.brand}>
                    <td className="truncate px-5 py-2.5 font-semibold text-slate-900 dark:text-white">{b.brand}</td>
                    {months.map((m) => (
                      <td key={m.key} className="px-2 py-2.5 text-right text-xs text-slate-700 dark:text-slate-300">
                        {cell(b.row.get(m.key))}
                      </td>
                    ))}
                    <td className="px-5 py-2.5 text-right text-xs font-bold text-slate-900 dark:text-white">{formatCompactINR(b.total)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50/70 dark:bg-slate-950/40">
                  <td className="px-5 py-2.5 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Collected</td>
                  {months.map((m) => (
                    <td key={m.key} className="px-2 py-2.5 text-right text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      {cell(collectedByMonth.get(m.key))}
                    </td>
                  ))}
                  <td className="px-5 py-2.5 text-right text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCompactINR([...collectedByMonth.values()].reduce((a, b) => a + b, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </SandboxCard>
        </div>
        <PaymentPipelineCard p={pipelineCash} href="/finance-ledger" />
      </div>
    </div>
  );
}
