import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canPostBrief, canViewBriefs, isSuperAdmin } from "@/lib/rbac";
import { formatCompactINR } from "@/lib/format";
import { Kpi, PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";
import { DbNotice, ErrorBanner, Pill, fmtDate, inputClass, labelClass, primaryBtn } from "@/components/gaps/Ui";
import { createBriefForm } from "@/lib/briefActions";
import { formatHours, workingHoursBetween } from "@/lib/workingHours";
import { STATUS_TEXT, STATUS_TONE } from "@/components/gaps/briefStatus";

// Briefs & strategy (gap build). Business Development posts briefs, Brand
// Solutions works them, CXO reads. Row scope: BD sees briefs they posted;
// Brand Solutions sees unclaimed briefs plus the ones they own or posted;
// CXO sees all (read only).

type BriefRow = {
  id: string; title: string; brand: string; status: string; budget: number | null; expectedCpv: number | null; creatorQty: number | null;
  deliverableQty: number | null; createdByName: string; ownerName: string | null; receivedAt: Date; fulfilledAt: Date | null; campaignId: string | null;
  timelineStart: Date | null; timelineEnd: Date | null; platformPlan: string | null;
};

export default async function BriefsPage({ searchParams }: { searchParams: Promise<{ error?: string; view?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewBriefs(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");
  const { error, view } = await searchParams;

  const where =
    user.role === "CXO" || isSuperAdmin(user.id)
      ? {}
      : user.role === "BRAND_SOLUTIONS"
      ? { OR: [{ ownerId: null, status: "NEW" }, { ownerId: user.id }, { createdById: user.id }] }
      : { createdById: user.id };

  let briefs: BriefRow[] = [];
  try {
    briefs = await (prisma as any).brief.findMany({ where, orderBy: { receivedAt: "desc" } });
  } catch {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
        <PageHeadline title="Briefs & strategy" subtitle="From client brief to campaign" />
        <DbNotice what="Briefs & strategy" />
      </div>
    );
  }

  const now = new Date();
  const open = briefs.filter((b) => ["NEW", "IN_PROGRESS", "CLARIFICATION"].includes(b.status));
  const shown = view === "closed" ? briefs.filter((b) => !open.includes(b)) : view === "all" ? briefs : open;
  const fulfilled = briefs.filter((b) => b.status === "FULFILLED" && b.fulfilledAt);
  const avgFulfil = fulfilled.length ? fulfilled.reduce((s, b) => s + workingHoursBetween(new Date(b.receivedAt), new Date(b.fulfilledAt!)), 0) / fulfilled.length : null;
  const tab = (key: string, label: string) => (
    <Link
      href={key === "open" ? "/briefs" : `/briefs?view=${key}`}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${(view ?? "open") === key ? "bg-slate-900 text-white dark:bg-indigo-600" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline
        title={user.role === "BUSINESS_DEVELOPMENT" ? "Your briefs and client pipeline." : "From strategy to execution."}
        subtitle="Briefs & strategy · clocks run on working hours, Monday–Friday 11:00–19:00 IST"
      />
      <ErrorBanner error={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="Open briefs" value={open.length} hint={`${briefs.filter((b) => b.status === "NEW").length} not picked up yet`} />
        <Kpi label="Waiting on clarification" value={briefs.filter((b) => b.status === "CLARIFICATION").length} hint="Questions to the brief's author" />
        <Kpi label="Fulfilled" value={fulfilled.length} hint="Campaign created and linked" />
        <Kpi label="Avg time to fulfil" value={avgFulfil === null ? "—" : formatHours(avgFulfil)} hint="Received to campaign linked" />
      </div>

      {(canPostBrief(user.role) || isSuperAdmin(user.id)) && (
        <details className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-bold text-slate-900 dark:text-white">
            + Post a new brief
          </summary>
          <form action={createBriefForm} className="grid grid-cols-1 gap-4 border-t border-slate-100 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
            <div className="lg:col-span-2"><label className={labelClass}>Brief title *</label><input name="title" required className={inputClass} placeholder="Festive launch, Q1 awareness…" /></div>
            <div><label className={labelClass}>Brand *</label><input name="brand" required className={inputClass} /></div>
            <div><label className={labelClass}>Category</label><input name="category" className={inputClass} /></div>
            <div className="lg:col-span-2"><label className={labelClass}>Objective</label><input name="objective" className={inputClass} placeholder="Awareness, consideration, sales…" /></div>
            <div className="lg:col-span-2"><label className={labelClass}>Product link</label><input name="productUrl" type="url" className={inputClass} placeholder="https://" /></div>
            <div><label className={labelClass}>Budget (₹)</label><input name="budget" inputMode="decimal" className={inputClass} /></div>
            <div><label className={labelClass}>Expected CPV (₹)</label><input name="expectedCpv" inputMode="decimal" className={inputClass} /></div>
            <div><label className={labelClass}>Creators</label><input name="creatorQty" inputMode="numeric" className={inputClass} /></div>
            <div><label className={labelClass}>Deliverables</label><input name="deliverableQty" inputMode="numeric" className={inputClass} /></div>
            <div className="lg:col-span-2"><label className={labelClass}>Platform plan</label><input name="platformPlan" className={inputClass} placeholder="e.g. 4 YouTube long form, 10 Reels" /></div>
            <div><label className={labelClass}>Languages</label><input name="languages" className={inputClass} /></div>
            <div><label className={labelClass}>Regions</label><input name="regions" className={inputClass} /></div>
            <div><label className={labelClass}>Timeline start</label><input name="timelineStart" type="date" className={inputClass} /></div>
            <div><label className={labelClass}>Timeline end</label><input name="timelineEnd" type="date" className={inputClass} /></div>
            <div className="sm:col-span-2"><label className={labelClass}>Notes</label><input name="notes" className={inputClass} /></div>
            <div className="flex items-end sm:col-span-2 lg:col-span-4"><button className={primaryBtn}>Post brief</button></div>
          </form>
        </details>
      )}

      <SandboxCard title="Briefs" aside={<div className="flex gap-1">{tab("open", "Open")}{tab("closed", "Closed")}{tab("all", "All")}</div>}>
        <table className="w-full table-fixed text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={`w-[30%] ${thClass}`}>Brief</th>
              <th className={`w-[20%] ${thClass}`}>Status · owner</th>
              <th className={`w-[20%] ${thClass}`}>Scope</th>
              <th className={`w-[18%] ${thClass}`}>Clock</th>
              <th className={`w-[12%] ${thClass}`}></th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {shown.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No briefs here.</td></tr>}
            {shown.map((b) => {
              const end = b.fulfilledAt ? new Date(b.fulfilledAt) : now;
              const hrs = workingHoursBetween(new Date(b.receivedAt), end);
              return (
                <tr key={b.id} className="align-top">
                  <td className="px-5 py-3">
                    <Link href={`/briefs/${b.id}`} className="block truncate font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">{b.title}</Link>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{b.brand} · posted by {b.createdByName}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Pill tone={STATUS_TONE[b.status]}>{STATUS_TEXT[b.status] ?? b.status}</Pill>
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{b.ownerName ? `BS ${b.ownerName}` : "Not picked up"}</p>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-300">
                    <p>{b.budget != null ? formatCompactINR(b.budget) : "Budget —"}{b.expectedCpv != null ? ` · CPV ₹${b.expectedCpv}` : ""}</p>
                    <p className="truncate text-slate-500 dark:text-slate-400">{[b.creatorQty != null ? `${b.creatorQty} creators` : null, b.deliverableQty != null ? `${b.deliverableQty} deliverables` : null].filter(Boolean).join(" · ") || b.platformPlan || "—"}</p>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{formatHours(hrs)}</p>
                    <p className="text-slate-500 dark:text-slate-400">{b.fulfilledAt ? `fulfilled ${fmtDate(b.fulfilledAt)}` : `since ${fmtDate(b.receivedAt)}`}</p>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/briefs/${b.id}`} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Open →</Link>
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
