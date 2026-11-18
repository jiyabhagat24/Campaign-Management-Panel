import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, isClient, reportingShowsCpv } from "@/lib/rbac";
import { PLATFORM_LABELS, PLATFORMS, type Platform } from "@/lib/constants";
import { formatCompactINR } from "@/lib/format";
import { Kpi, PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";
import { fmtDate, fmtDateTime } from "@/components/gaps/Ui";

// Reporting across campaigns (gap build). Spec Page Permissions, Reporting:
// every login can view within its scope (assignment, G13). Clients see
// published reports only. IR Interns see delivery and performance only, so
// no CPV or spend (built from quoted cost, G3). Numbers come from the API
// refresh only (G8). Formats are never merged: totals are per format.
// The existing /reports page is unchanged.

const n = (v: number) => v.toLocaleString("en-IN");

export default async function ReportingPage({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { format } = await searchParams;
  const showCost = reportingShowsCpv(user.role);
  const client = isClient(user.role);

  const campaigns = await prisma.campaign.findMany({
    where: { ...campaignVisibilityWhere(user), status: { not: "CANCELLED" }, ...(client ? { reportPublished: true } : {}) },
    select: {
      id: true, name: true, brand: true,
      creators: {
        where: { status: "ONBOARDED" },
        select: {
          id: true, name: true, finalQuotedCost: true,
          deliverables: { select: { id: true, platform: true, liveLink: true, liveDate: true, views: true, likes: true, comments: true, shares: true, lastTrackedAt: true } },
        },
      },
    },
  });

  const rows = campaigns.flatMap((c) =>
    c.creators.flatMap((cr) => {
      const live = cr.deliverables.filter((d) => d.liveLink);
      const unit = live.length ? (cr.finalQuotedCost ?? 0) / live.length : 0;
      return live.map((d) => {
        const views = d.views ?? 0;
        const eng = (d.likes ?? 0) + (d.comments ?? 0) + (d.platform.startsWith("INSTAGRAM") ? d.shares ?? 0 : 0);
        return { c, cr, d, unit, views, er: views > 0 ? (eng / views) * 100 : null, cpv: views > 0 ? unit / views : null };
      });
    })
  );

  const byFormat = PLATFORMS.map((p) => {
    const r = rows.filter((x) => x.d.platform === p);
    const views = r.reduce((s, x) => s + x.views, 0);
    const spend = r.reduce((s, x) => s + x.unit, 0);
    const eng = r.reduce((s, x) => s + (x.d.likes ?? 0) + (x.d.comments ?? 0) + (p.startsWith("INSTAGRAM") ? x.d.shares ?? 0 : 0), 0);
    return { p, count: r.length, views, spend, cpv: views > 0 ? spend / views : null, er: views > 0 ? (eng / views) * 100 : null };
  }).filter((f) => f.count > 0);

  const shown = (format ? rows.filter((r) => r.d.platform === format) : rows).sort((a, b) => b.views - a.views);
  const totalViews = rows.reduce((s, r) => s + r.views, 0);
  const utilised = rows.reduce((s, r) => s + r.unit, 0);
  const lastRefresh = rows.reduce<Date | null>((m, r) => (r.d.lastTrackedAt && (!m || r.d.lastTrackedAt > m) ? r.d.lastTrackedAt : m), null);
  const chip = (key: string | null, label: string) => (
    <Link
      key={key ?? "all"}
      href={key ? `/reporting?format=${key}` : "/reporting"}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${(format ?? null) === key ? "bg-slate-900 text-white dark:bg-indigo-600" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline
        title={client ? "How your campaigns are performing." : "Live content, across campaigns."}
        subtitle={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}${client ? " with a published report" : ""} · numbers from the YouTube and Instagram refresh only`}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="Live deliverables" value={rows.length} hint={`${new Set(rows.map((r) => r.cr.id)).size} creators`} />
        <Kpi label="Total views" value={n(totalViews)} hint="All formats, each counted in its own format below" />
        {showCost ? <Kpi label="Utilised budget" value={formatCompactINR(utilised)} hint="Quoted cost of live deliverables" /> : <Kpi label="Formats live" value={byFormat.length} hint="Long form, Shorts, Reels… kept apart" />}
        <Kpi label="Last refresh" value={lastRefresh ? fmtDate(lastRefresh) : "—"} hint={lastRefresh ? fmtDateTime(lastRefresh) : "No refresh yet"} />
      </div>

      <SandboxCard title="By format" footer="Formats are never merged. CPV = quoted cost of live deliverables ÷ views.">
        <table className="w-full table-fixed text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={`w-[34%] ${thClass}`}>Format</th>
              <th className={`w-[16%] ${thClass}`}>Live</th>
              <th className={`w-[20%] ${thClass}`}>Views</th>
              <th className={`w-[15%] ${thClass}`}>ER</th>
              {showCost && <th className={`w-[15%] ${thClass}`}>CPV</th>}
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {byFormat.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No live content yet.</td></tr>}
            {byFormat.map((f) => (
              <tr key={f.p}>
                <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">{PLATFORM_LABELS[f.p as Platform]}</td>
                <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{f.count}</td>
                <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{n(f.views)}</td>
                <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{f.er == null ? "—" : `${f.er.toFixed(2)}%`}</td>
                {showCost && <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{f.cpv == null ? "—" : `₹${f.cpv.toFixed(2)}`}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </SandboxCard>

      <SandboxCard title="Live content" aside={<div className="flex flex-wrap gap-1">{chip(null, "All")}{byFormat.map((f) => chip(f.p, PLATFORM_LABELS[f.p as Platform]))}</div>}>
        <table className="w-full table-fixed text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={`w-[30%] ${thClass}`}>Creator · campaign</th>
              <th className={`w-[20%] ${thClass}`}>Format · live</th>
              <th className={`w-[22%] ${thClass}`}>Views · engagement</th>
              <th className={`w-[14%] ${thClass}`}>{showCost ? "ER · CPV" : "ER"}</th>
              <th className={`w-[14%] ${thClass}`}>Snapshot</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {shown.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No live content in this view.</td></tr>}
            {shown.map(({ c, cr, d, views, er, cpv }) => (
              <tr key={d.id} className="align-top">
                <td className="px-5 py-3">
                  <a href={d.liveLink!} target="_blank" rel="noreferrer" className="block truncate font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">{cr.name} ↗</a>
                  <Link href={`/campaigns/${c.id}`} className="block truncate text-xs text-slate-500 hover:underline dark:text-slate-400">{c.brand} · {c.name}</Link>
                </td>
                <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
                  <p>{PLATFORM_LABELS[d.platform as Platform] ?? d.platform}</p>
                  <p className="text-slate-500 dark:text-slate-400">{fmtDate(d.liveDate)}</p>
                </td>
                <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{n(views)}</p>
                  <p className="text-slate-500 dark:text-slate-400">{n(d.likes ?? 0)} likes · {n(d.comments ?? 0)} comments</p>
                </td>
                <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
                  <p>{er == null ? "—" : `${er.toFixed(2)}%`}</p>
                  {showCost && <p className="text-slate-500 dark:text-slate-400">{cpv == null ? "—" : `₹${cpv.toFixed(2)}`}</p>}
                </td>
                <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">{d.lastTrackedAt ? fmtDateTime(d.lastTrackedAt) : "Not refreshed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SandboxCard>
    </div>
  );
}
