import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canViewMoneyExposure, isSuperAdmin } from "@/lib/rbac";
import { formatCompactINR } from "@/lib/format";
import { Kpi, PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";

// Money & exposure (sandbox audit, Phase 1). New page; the existing
// dashboard and its margin card are untouched. Two things the dashboard
// can't show today:
//  1. Committed margin next to the creator cost still in negotiation, so
//     margin is never read without the exposure that could still land on it.
//  2. Creators whose "owner" differs depending on the field you read
//     (sourcedByUserId vs pocUserId) — the input needed to agree one rule.

const PENDING_STATUSES = ["SHORTLISTED", "CLIENT_LIKED", "CLIENT_NEGOTIATING"];
const OPEN_CAMPAIGN_STATUSES = ["DRAFT", "ASSIGNED", "ACTIVE", "ON_HOLD"];

function pct(n: number | null) {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

export default async function MoneyExposurePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewMoneyExposure(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");

  const campaigns = await prisma.campaign.findMany({
    where: { ...campaignVisibilityWhere(user), status: { in: OPEN_CAMPAIGN_STATUSES } },
    select: {
      id: true,
      name: true,
      brand: true,
      status: true,
      creators: {
        select: {
          id: true,
          name: true,
          status: true,
          internalCost: true,
          quotedCost: true,
          finalQuotedCost: true,
          payoutPaymentStatus: true,
          sourcedByUserId: true,
          pocUserId: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const invoices = (await (prisma as any).clientInvoice.findMany({
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
    select: { campaignId: true, invoiceAmount: true, amountReceived: true },
  })) as { campaignId: string; invoiceAmount: number; amountReceived: number | null }[];

  const rows = campaigns.map((c) => {
    const onboarded = c.creators.filter((cr) => cr.status === "ONBOARDED");
    const pending = c.creators.filter((cr) => PENDING_STATUSES.includes(cr.status));
    const quoted = onboarded.reduce((s, cr) => s + (cr.finalQuotedCost ?? cr.quotedCost ?? 0), 0);
    const committedCost = onboarded.reduce((s, cr) => s + (cr.internalCost ?? 0), 0);
    const pendingCost = pending.reduce((s, cr) => s + (cr.internalCost ?? 0), 0);
    const pendingQuoted = pending.reduce((s, cr) => s + (cr.finalQuotedCost ?? cr.quotedCost ?? 0), 0);
    const payable = onboarded.filter((cr) => cr.payoutPaymentStatus !== "PAID").reduce((s, cr) => s + (cr.internalCost ?? 0), 0);
    const inv = invoices.filter((i) => i.campaignId === c.id);
    const invoiced = inv.reduce((s, i) => s + i.invoiceAmount, 0);
    const received = inv.reduce((s, i) => s + (i.amountReceived ?? 0), 0);
    const marginNow = quoted > 0 ? ((quoted - committedCost) / quoted) * 100 : null;
    const ifAllClose = quoted + pendingQuoted > 0 ? ((quoted + pendingQuoted - committedCost - pendingCost) / (quoted + pendingQuoted)) * 100 : null;
    return { ...c, quoted, committedCost, pendingCost, pendingCount: pending.length, payable, invoiced, received, marginNow, ifAllClose };
  });

  const t = rows.reduce(
    (a, r) => ({
      quoted: a.quoted + r.quoted,
      committed: a.committed + r.committedCost,
      pending: a.pending + r.pendingCost,
      pendingCount: a.pendingCount + r.pendingCount,
      payable: a.payable + r.payable,
      invoiced: a.invoiced + r.invoiced,
      received: a.received + r.received,
    }),
    { quoted: 0, committed: 0, pending: 0, pendingCount: 0, payable: 0, invoiced: 0, received: 0 }
  );
  const totalMargin = t.quoted > 0 ? ((t.quoted - t.committed) / t.quoted) * 100 : null;

  // Ownership check — same creator, two different "owners".
  const userIds = new Set<string>();
  for (const c of campaigns) for (const cr of c.creators) {
    if (cr.sourcedByUserId) userIds.add(cr.sourcedByUserId);
    if (cr.pocUserId) userIds.add(cr.pocUserId);
  }
  const people = await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } });
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const ownershipRows = campaigns.flatMap((c) =>
    c.creators
      .filter((cr) => cr.status === "ONBOARDED" && cr.sourcedByUserId !== cr.pocUserId)
      .map((cr) => ({
        id: cr.id,
        campaignId: c.id,
        campaign: `${c.brand} · ${c.name}`,
        creator: cr.name,
        sourcedBy: cr.sourcedByUserId ? nameOf.get(cr.sourcedByUserId) ?? "Unknown" : null,
        poc: cr.pocUserId ? nameOf.get(cr.pocUserId) ?? "Unknown" : null,
      }))
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline title="Money and exposure, side by side." subtitle="Open campaigns in your scope · margin is never shown without the creator cost still in negotiation" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="Committed margin" value={pct(totalMargin)} hint={`${formatCompactINR(t.quoted - t.committed)} on ${formatCompactINR(t.quoted)} quoted (onboarded only)`} />
        <Kpi label="Pending creator cost" value={formatCompactINR(t.pending)} hint={`${t.pendingCount} creators shortlisted or negotiating`} />
        <Kpi label="Client outstanding" value={formatCompactINR(t.invoiced - t.received)} hint={`${formatCompactINR(t.invoiced)} invoiced · ${formatCompactINR(t.received)} received`} />
        <Kpi label="Creator payable pending" value={formatCompactINR(t.payable)} hint="Onboarded creators not yet marked paid" />
      </div>

      <SandboxCard
        title="Margin by campaign"
        footer="Margin now = onboarded quoted value less onboarded creator cost. If all pending close = the same, adding every shortlisted or negotiating creator's quote and cost. Rejected creators are excluded."
      >
        <table className="w-full table-fixed text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={`w-[30%] ${thClass}`}>Campaign</th>
              <th className={`w-[20%] ${thClass}`}>Quoted / committed cost</th>
              <th className={`w-[18%] ${thClass}`}>Pending exposure</th>
              <th className={`w-[16%] ${thClass}`}>Margin</th>
              <th className={`w-[16%] ${thClass}`}>Client cash</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No open campaigns in your scope.</td>
              </tr>
            )}
            {rows.map((r) => {
              const drop = r.marginNow !== null && r.ifAllClose !== null ? r.marginNow - r.ifAllClose : 0;
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-5 py-3">
                    <Link href={`/campaigns/${r.id}`} className="block truncate font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">
                      {r.name}
                    </Link>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.brand} · {r.status.replace("_", " ").toLowerCase()}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                    <p className="font-semibold">{formatCompactINR(r.quoted)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatCompactINR(r.committedCost)} committed</p>
                  </td>
                  <td className="px-5 py-3">
                    {r.pendingCount === 0 ? (
                      <span className="text-xs text-slate-400 dark:text-slate-500">None</span>
                    ) : (
                      <>
                        <p className="font-semibold text-amber-700 dark:text-amber-300">{formatCompactINR(r.pendingCost)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{r.pendingCount} creator{r.pendingCount === 1 ? "" : "s"}</p>
                      </>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900 dark:text-white">{pct(r.marginNow)} now</p>
                    <p className={`text-xs ${drop > 2 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>{pct(r.ifAllClose)} if all pending close</p>
                  </td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                    <p>{formatCompactINR(r.invoiced)} invoiced</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatCompactINR(r.invoiced - r.received)} outstanding</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SandboxCard>

      <SandboxCard
        title="Creator ownership check"
        aside={<span className="text-xs text-slate-500 dark:text-slate-400">{ownershipRows.length} onboarded creators</span>}
        footer="Different screens decide who owns a creator by different fields: the IR Executive dashboard uses Sourced by, creator assignment uses POC. These creators come out differently depending on which one you read. Agree one rule, then this list should be empty."
      >
        {ownershipRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Every onboarded creator has the same sourcer and POC.</p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className={theadClass}>
              <tr>
                <th className={`w-[34%] ${thClass}`}>Creator / campaign</th>
                <th className={`w-[33%] ${thClass}`}>Sourced by</th>
                <th className={`w-[33%] ${thClass}`}>POC</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {ownershipRows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-5 py-3">
                    <Link href={`/campaigns/${r.campaignId}`} className="block truncate font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">
                      {r.creator}
                    </Link>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.campaign}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{r.sourcedBy ?? <span className="text-slate-400 dark:text-slate-500">Not set</span>}</td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{r.poc ?? <span className="text-slate-400 dark:text-slate-500">Not set</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SandboxCard>
    </div>
  );
}
