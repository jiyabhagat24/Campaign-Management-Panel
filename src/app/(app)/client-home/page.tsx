import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewClientOverview } from "@/lib/rbac";
import { formatCompactINR } from "@/lib/format";
import { Kpi, PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";
import { ExceptionsCard, type Exception } from "@/components/management/Cards";

// Client overview (sandbox audit, Phase 3). The client's own summary:
// decisions needed, planned vs delivered, next milestone, blockers in plain
// words, and invoices. New page; the client's existing Campaigns view is
// unchanged.
//
// Leak rules (workflow spec G1, G2, G9): the query never selects internal
// cost, only published creators are counted, and no internal countdown or
// activity trail is shown — go-live dates and flags only.

export default async function ClientHomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewClientOverview(user.role)) redirect("/campaigns");

  const campaigns = await prisma.campaign.findMany({
    where: { clientAccess: { some: { clientId: user.id } }, status: { not: "CANCELLED" } },
    select: {
      id: true,
      name: true,
      brand: true,
      status: true,
      creators: {
        where: { quotedCostPublished: true, status: { not: "REJECTED" } },
        select: {
          id: true,
          name: true,
          status: true,
          clientIntent: true,
          goLiveDeadline: true,
          ballOwner: true,
          deliverables: { select: { platform: true, scriptStatus: true, contentStatus: true, productStatus: true, liveLink: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  const invoices = (await (prisma as any).clientInvoice.findMany({
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
    select: { campaignId: true, invoiceNumber: true, invoiceAmount: true, amountReceived: true },
  })) as { campaignId: string; invoiceNumber: string | null; invoiceAmount: number; amountReceived: number | null }[];

  const decisions: Exception[] = [];
  for (const c of campaigns) {
    for (const cr of c.creators) {
      if (cr.status !== "ONBOARDED" && (!cr.clientIntent || cr.clientIntent === "PENDING")) {
        decisions.push({ tone: "medium", title: `Review creator · ${cr.name}`, reason: `${c.name} · choose Onboard, Negotiate or Cancel`, href: `/campaigns/${c.id}` });
      }
      if (cr.status !== "ONBOARDED") continue;
      for (const d of cr.deliverables) {
        if (d.scriptStatus === "SENT_FOR_APPROVAL") decisions.push({ tone: "medium", title: `Approve script · ${cr.name}`, reason: `${c.name} · script sent for your approval`, href: `/campaigns/${c.id}` });
        if (d.contentStatus === "EXTERNAL_APPROVAL") decisions.push({ tone: "high", title: `Approve video · ${cr.name}`, reason: `${c.name} · video sent for your approval`, href: `/campaigns/${c.id}` });
      }
    }
  }

  const rows = campaigns.map((c) => {
    const onboarded = c.creators.filter((cr) => cr.status === "ONBOARDED");
    const dels = onboarded.flatMap((cr) => cr.deliverables);
    const live = dels.filter((d) => d.liveLink).length;
    const upcoming = onboarded
      .filter((cr) => cr.goLiveDeadline && cr.deliverables.some((d) => !d.liveLink))
      .map((cr) => ({ name: cr.name, date: cr.goLiveDeadline as Date }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
    const yourApprovals = dels.filter((d) => d.scriptStatus === "SENT_FOR_APPROVAL" || d.contentStatus === "EXTERNAL_APPROVAL").length;
    const product = dels.filter((d) => !d.liveLink && d.productStatus && d.productStatus !== "DELIVERED" && d.productStatus !== "INSTALLED").length;
    const paused = onboarded.filter((cr) => cr.status === "BLOCKED" || cr.ballOwner === "BLOCKED").length;
    const blockers: string[] = [];
    if (yourApprovals) blockers.push(`${yourApprovals} waiting on your approval`);
    if (product) blockers.push(`${product} waiting on product delivery`);
    if (paused) blockers.push(`${paused} paused`);
    const inv = invoices.filter((i) => i.campaignId === c.id);
    return { c, onboarded: onboarded.length, dels: dels.length, live, upcoming, blockers, invoiced: inv.reduce((s, i) => s + i.invoiceAmount, 0), paid: inv.reduce((s, i) => s + (i.amountReceived ?? 0), 0) };
  });
  const totals = rows.reduce((a, r) => ({ dels: a.dels + r.dels, live: a.live + r.live, due: a.due + r.invoiced - r.paid }), { dels: 0, live: 0, due: 0 });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline title="Your campaigns. Your next decisions." subtitle={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="Your decisions" value={decisions.length} hint="Creators, scripts and videos to review" />
        <Kpi label="Delivered" value={`${totals.live} / ${totals.dels}`} hint="Deliverables live of planned" />
        <Kpi label="Campaigns" value={campaigns.length} hint={`${campaigns.filter((c) => c.status === "ACTIVE").length} active`} />
        <Kpi label="Balance due" value={formatCompactINR(totals.due)} hint="Invoiced less paid" />
      </div>

      <ExceptionsCard title="Decisions waiting on you" items={decisions} emptyText="Nothing needs your decision right now." />

      <SandboxCard title="Campaign progress" footer="Only creators shared with you are counted.">
        <table className="w-full table-fixed text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={`w-[28%] ${thClass}`}>Campaign</th>
              <th className={`w-[20%] ${thClass}`}>Planned vs delivered</th>
              <th className={`w-[20%] ${thClass}`}>Next go-live</th>
              <th className={`w-[32%] ${thClass}`}>What's holding it up</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No campaigns shared with you yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.c.id} className="align-top">
                <td className="px-5 py-3">
                  <Link href={`/campaigns/${r.c.id}`} className="block truncate font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">{r.c.name}</Link>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.c.brand} · {r.onboarded} creators</p>
                </td>
                <td className="px-5 py-3">
                  <p className="text-slate-700 dark:text-slate-300">{r.live} of {r.dels} live</p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${r.dels ? Math.round((r.live / r.dels) * 100) : 0}%` }} />
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                  {r.upcoming ? (
                    <>
                      <p>{r.upcoming.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.upcoming.name}</p>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">{r.dels && r.live === r.dels ? "All live" : "Not scheduled"}</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {r.blockers.length === 0 ? (
                    <span className="text-xs text-slate-400 dark:text-slate-500">Nothing blocked</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {r.blockers.map((b) => (
                        <span key={b} className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">{b}</span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SandboxCard>
    </div>
  );
}
