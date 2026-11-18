import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canFinanceSignOff, canReleaseDeliverables, canViewCampaignGates, isSuperAdmin } from "@/lib/rbac";
import { allPass, canReleaseFor, closureChecks } from "@/lib/gates";
import { versionLabel } from "@/lib/versionHistory";
import { PLATFORM_LABELS, type Platform } from "@/lib/constants";
import { PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";
import { DbNotice, ErrorBanner, Pill, fmtDateTime, primaryBtn } from "@/components/gaps/Ui";
import { closeExecutionForm, financeSignOffForm, releaseDeliverableForm } from "@/lib/gateActions";

const statusText = (s: string | null) => (s ? s.replace(/_/g, " ").toLowerCase() : "not started");

export default async function CampaignGateDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewCampaignGates(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");
  const { id } = await params;
  const { error } = await searchParams;

  let c: any;
  try {
    c = await (prisma as any).campaign.findFirst({
      where: { id, ...campaignVisibilityWhere(user) },
      select: {
        id: true, name: true, brand: true, status: true, reportPublished: true, closure: true,
        teamMembers: { select: { userId: true, roleOnCampaign: true, user: { select: { name: true } } } },
        briefs: { select: { id: true, title: true, expectedCpv: true } },
        creators: {
          where: { status: "ONBOARDED" },
          orderBy: { name: "asc" },
          select: {
            id: true, name: true, status: true, poc: { select: { name: true } },
            deliverables: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true, platform: true, title: true, scriptStatus: true, contentStatus: true, scriptDocUrl: true, reviewLink: true, liveLink: true, lastTrackedAt: true,
                releases: { select: { kind: true, releasedByName: true, createdAt: true, note: true } },
                versions: { orderBy: [{ kind: "asc" }, { versionNo: "asc" }], select: { kind: true, versionNo: true, url: true, statusAtTime: true, actorName: true, createdAt: true } },
              },
            },
          },
        },
      },
    });
  } catch {
    return <div className="mx-auto max-w-7xl p-6 lg:p-8"><DbNotice what="Campaign gates" /></div>;
  }
  if (!c) notFound();

  const isCm = c.teamMembers.some((t: any) => t.userId === user.id && t.roleOnCampaign === "CAMPAIGN_MANAGER");
  const canRelease = (canReleaseDeliverables(user.role) && isCm) || isSuperAdmin(user.id);
  const checks = closureChecks({ ...c, creators: c.creators });
  const ready = allPass(checks);
  const back = `/campaign-gates/${c.id}`;
  const expectedCpv = c.briefs.find((b: any) => b.expectedCpv != null)?.expectedCpv ?? null;

  const gateCell = (d: any, kind: "SHOOT" | "PUBLISH") => {
    const done = d.releases.find((r: any) => r.kind === kind);
    if (done) return <span className="text-xs text-slate-600 dark:text-slate-300"><Pill tone="dark">Released</Pill><span className="mt-1 block text-[11px] text-slate-500">{done.releasedByName} · {fmtDateTime(done.createdAt)}</span></span>;
    const check = canReleaseFor(kind, d);
    if (check.ok && canRelease) {
      return (
        <form action={releaseDeliverableForm}>
          <input type="hidden" name="deliverableId" value={d.id} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="back" value={back} />
          <button className={primaryBtn}>{kind === "SHOOT" ? "Release for shoot" : "Release for publishing"}</button>
        </form>
      );
    }
    return <span className="text-xs text-slate-500 dark:text-slate-400">{check.ok ? "Waiting on the CM" : check.reason}</span>;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <Link href="/campaign-gates" className="text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400">← Campaign gates</Link>
      <PageHeadline title={c.name} subtitle={`${c.brand} · ${statusText(c.status)}${expectedCpv != null ? ` · expected CPV ₹${expectedCpv} (from brief)` : ""}`} />
      <ErrorBanner error={error} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SandboxCard title="Release gates" footer="Release for shoot opens once the script is approved; release for publishing once the video is approved. Only this campaign's Campaign Manager can release.">
            <table className="w-full table-fixed text-sm">
              <thead className={theadClass}>
                <tr>
                  <th className={`w-[30%] ${thClass}`}>Creator · deliverable</th>
                  <th className={`w-[22%] ${thClass}`}>Script · video</th>
                  <th className={`w-[24%] ${thClass}`}>Shoot</th>
                  <th className={`w-[24%] ${thClass}`}>Publishing</th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {c.creators.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No onboarded creators yet.</td></tr>}
                {c.creators.flatMap((cr: any) =>
                  cr.deliverables.map((d: any) => (
                    <tr key={d.id} className="align-top">
                      <td className="px-5 py-3">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{cr.name}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{PLATFORM_LABELS[d.platform as Platform] ?? d.platform} · SPOC {cr.poc?.name ?? "not set"}</p>
                        {d.versions.length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">{d.versions.length} version{d.versions.length === 1 ? "" : "s"}</summary>
                            <ul className="mt-1 space-y-1">
                              {d.versions.map((v: any) => (
                                <li key={`${v.kind}${v.versionNo}`} className="text-[11px] text-slate-600 dark:text-slate-300">
                                  <a href={v.url} target="_blank" rel="noreferrer" className="font-bold text-indigo-600 hover:underline dark:text-indigo-400">{versionLabel(v.kind, v.versionNo)}</a>{" "}
                                  {v.statusAtTime ? `${statusText(v.statusAtTime)} · ` : ""}{v.actorName ?? ""} · {fmtDateTime(v.createdAt)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
                        <p>Script: {statusText(d.scriptStatus)}</p>
                        <p>Video: {statusText(d.contentStatus)}</p>
                        <p className="text-slate-500 dark:text-slate-400">{d.liveLink ? (d.lastTrackedAt ? "Live · tracked" : "Live · not tracked yet") : "Not live"}</p>
                      </td>
                      <td className="px-5 py-3">{gateCell(d, "SHOOT")}</td>
                      <td className="px-5 py-3">{gateCell(d, "PUBLISH")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SandboxCard>
        </div>

        <SandboxCard title="Closure">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {checks.map((x) => (
              <li key={x.key} className="flex items-start justify-between gap-3 px-5 py-3">
                <span>
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">{x.label}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{x.detail}</span>
                </span>
                <Pill tone={x.ok ? "dark" : "rose"}>{x.ok ? "Pass" : "Open"}</Pill>
              </li>
            ))}
            <li className="space-y-3 px-5 py-4 text-sm">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Execution closure · Campaign Manager</p>
                {c.closure?.executionClosedAt ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Closed by {c.closure.executionClosedByName} · {fmtDateTime(c.closure.executionClosedAt)}</p>
                ) : canRelease ? (
                  <form action={closeExecutionForm} className="mt-1"><input type="hidden" name="campaignId" value={c.id} /><button disabled={!ready} className={primaryBtn}>Close execution</button></form>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Waiting on the Campaign Manager</p>
                )}
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Financial sign-off · Finance</p>
                {c.closure?.financeSignedOffAt ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Signed by {c.closure.financeSignedOffByName} · {fmtDateTime(c.closure.financeSignedOffAt)}</p>
                ) : (canFinanceSignOff(user.role) || isSuperAdmin(user.id)) && c.closure?.executionClosedAt ? (
                  <form action={financeSignOffForm} className="mt-1"><input type="hidden" name="campaignId" value={c.id} /><button disabled={!ready} className={primaryBtn}>Sign off</button></form>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{c.closure?.executionClosedAt ? "Waiting on Finance" : "After execution is closed"}</p>
                )}
              </div>
              {c.status === "CLOSED" && !ready && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">This campaign is closed but a check no longer passes. Review it with the Campaign Manager.</p>
              )}
            </li>
          </ul>
        </SandboxCard>
      </div>
    </div>
  );
}
