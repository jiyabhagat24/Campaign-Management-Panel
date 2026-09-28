import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewTimeAnalytics, campaignVisibilityWhere, isSuperAdmin } from "@/lib/rbac";
import { Clock } from "lucide-react";

// Step 7 — Time Analytics: stage-duration reporting so bottlenecks are
// visible instead of only ever showing up as an individual SLA-sweep
// notification. Three sections, each derived from data that already
// exists (no new tracking beyond pricingQueueEnteredAt, stamped in
// actions.ts the first time internalCost is set):
//   1. Pricing Queue wait time — every row still unpriced right now,
//      sorted longest-waiting first (mirrors the 48h/96h sweep flags).
//   2. Time to Onboard — createdAt -> onboardedAt, for creators who made it
//      to Onboarding.
//   3. Time to Go Live — onboardedAt -> earliest deliverable liveDate, for
//      onboarded creators with at least one live deliverable.
// Scoped the same as every other campaign-data page (campaignVisibilityWhere).

function hoursBetween(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / (60 * 60 * 1000);
}
function daysBetween(a: Date, b: Date) {
  return hoursBetween(a, b) / 24;
}
function fmtDays(days: number) {
  return days < 1 ? `${Math.round(days * 24)}h` : `${days.toFixed(1)}d`;
}

export default async function TimeAnalyticsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewTimeAnalytics(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");

  const campaigns = await prisma.campaign.findMany({
    where: campaignVisibilityWhere(user),
    select: {
      id: true,
      name: true,
      brand: true,
      creators: {
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          onboardedAt: true,
          internalCost: true,
          quotedCost: true,
          deliverables: { select: { liveDate: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const now = new Date();

  // ---- 1. Open pricing-queue waits ----
  const pricingRows = campaigns
    .flatMap((c) =>
      c.creators
        .filter((cr) => cr.internalCost !== null && cr.quotedCost === null && cr.status !== "REJECTED" && cr.status !== "CLIENT_REJECTED")
        .map((cr) => {
          const enteredAt = (cr as any).pricingQueueEnteredAt ? new Date((cr as any).pricingQueueEnteredAt) : cr.createdAt;
          return { campaignId: c.id, campaignName: c.name, brand: c.brand, creatorName: cr.name, hours: hoursBetween(enteredAt, now) };
        })
    )
    .sort((a, b) => b.hours - a.hours);

  // ---- 2. Time to onboard ----
  const onboardDurations = campaigns.flatMap((c) =>
    c.creators
      .filter((cr) => cr.onboardedAt)
      .map((cr) => ({
        campaignId: c.id,
        campaignName: c.name,
        brand: c.brand,
        creatorName: cr.name,
        days: daysBetween(cr.createdAt, cr.onboardedAt as Date),
      }))
  );
  const avgOnboardDays = onboardDurations.length > 0 ? onboardDurations.reduce((s, r) => s + r.days, 0) / onboardDurations.length : null;
  const slowestOnboard = [...onboardDurations].sort((a, b) => b.days - a.days).slice(0, 10);

  // ---- 3. Time to go live ----
  const liveDurations = campaigns.flatMap((c) =>
    c.creators
      .filter((cr) => cr.onboardedAt)
      .map((cr) => {
        const liveDates = cr.deliverables.map((d) => d.liveDate).filter((d): d is Date => d !== null);
        if (liveDates.length === 0) return null;
        const earliestLive = new Date(Math.min(...liveDates.map((d) => d.getTime())));
        return {
          campaignId: c.id,
          campaignName: c.name,
          brand: c.brand,
          creatorName: cr.name,
          days: daysBetween(cr.onboardedAt as Date, earliestLive),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  );
  const avgLiveDays = liveDurations.length > 0 ? liveDurations.reduce((s, r) => s + r.days, 0) / liveDurations.length : null;
  const slowestLive = [...liveDurations].sort((a, b) => b.days - a.days).slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <Clock className="h-6 w-6 text-indigo-500" />
          Time Analytics
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Where things are actually sitting slow — pricing wait, time to onboard, time to go live — across every campaign you can see.
        </p>
      </div>

      {/* ---- Pricing Queue wait time ---- */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pricing Queue — currently waiting</h2>
        {pricingRows.length === 0 ? (
          <p className="rounded-xl border border-slate-200/80 bg-white p-4 text-sm text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
            Nothing waiting on pricing right now.
          </p>
        ) : (
          <div className="space-y-2">
            {pricingRows.map((r, i) => (
              <Link
                key={i}
                href={`/campaigns/${r.campaignId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card transition-colors hover:border-indigo-200 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-indigo-800"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{r.creatorName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {r.brand} — {r.campaignName}
                  </p>
                </div>
                <span
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    r.hours >= 96
                      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                      : r.hours >= 48
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  Waiting {fmtDays(r.hours / 24)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---- Time to Onboard ---- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Time to Onboard</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Average: {avgOnboardDays !== null ? fmtDays(avgOnboardDays) : "—"} ({onboardDurations.length} onboarded)
          </span>
        </div>
        {slowestOnboard.length === 0 ? (
          <p className="rounded-xl border border-slate-200/80 bg-white p-4 text-sm text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
            No onboarded creators yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Creator</th>
                  <th className="px-4 py-2.5">Campaign</th>
                  <th className="px-4 py-2.5 text-right">Time to onboard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {slowestOnboard.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                      <Link href={`/campaigns/${r.campaignId}`} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                        {r.creatorName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                      {r.brand} — {r.campaignName}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">{fmtDays(r.days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- Time to Go Live ---- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Time to Go Live</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Average: {avgLiveDays !== null ? fmtDays(avgLiveDays) : "—"} ({liveDurations.length} live)
          </span>
        </div>
        {slowestLive.length === 0 ? (
          <p className="rounded-xl border border-slate-200/80 bg-white p-4 text-sm text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
            No live deliverables yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Creator</th>
                  <th className="px-4 py-2.5">Campaign</th>
                  <th className="px-4 py-2.5 text-right">Onboard → Live</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {slowestLive.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                      <Link href={`/campaigns/${r.campaignId}`} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                        {r.creatorName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                      {r.brand} — {r.campaignName}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">{fmtDays(r.days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
