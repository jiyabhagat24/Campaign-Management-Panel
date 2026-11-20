import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canCreateCampaign, canViewBriefs, canWorkBrief, isSuperAdmin } from "@/lib/rbac";
import { formatCompactINR } from "@/lib/format";
import { PageHeadline, SandboxCard } from "@/components/finance/SandboxUi";
import { DbNotice, ErrorBanner, Pill, fmtDate, fmtDateTime, inputClass, labelClass, primaryBtn, secondaryBtn } from "@/components/gaps/Ui";
import { STATUS_TEXT, STATUS_TONE } from "@/components/gaps/briefStatus";
import { linkBriefCampaignForm, postBriefMessageForm, setBriefOutcomeForm, startBriefForm } from "@/lib/briefActions";
import { formatHours, workingHoursBetween } from "@/lib/workingHours";

export default async function BriefDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewBriefs(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");
  const { id } = await params;
  const { error } = await searchParams;

  let b: any;
  try {
    b = await (prisma as any).brief.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } }, campaign: { select: { id: true, name: true, status: true } } } });
  } catch {
    return <div className="mx-auto max-w-5xl p-6 lg:p-8"><DbNotice what="Briefs & strategy" /></div>;
  }
  if (!b) notFound();
  // Row scope, same as the list.
  // The BD and Brand Solutions team can also read any brief from "Team briefs";
  // only the poster and the assigned BS person can write in it.
  const allowed =
    user.role === "CXO" || isSuperAdmin(user.id) || b.createdById === user.id || b.ownerId === user.id || (user.role === "BRAND_SOLUTIONS" && !b.ownerId && b.status === "NEW") ||
    user.role === "BUSINESS_DEVELOPMENT" || user.role === "BRAND_SOLUTIONS";
  if (!allowed) notFound();

  const isOwner = b.ownerId === user.id;
  const isAuthor = b.createdById === user.id;
  const closed = b.status === "FULFILLED" || b.status === "LOST";
  const linkable = isOwner && !closed
    ? await prisma.campaign.findMany({ where: { ...campaignVisibilityWhere(user), status: { not: "CANCELLED" } }, select: { id: true, name: true, brand: true }, orderBy: { createdAt: "desc" }, take: 50 })
    : [];
  const hrs = workingHoursBetween(new Date(b.receivedAt), b.fulfilledAt ? new Date(b.fulfilledAt) : new Date());

  const fields: [string, string][] = [
    ["Objective", b.objective ?? "—"],
    ["Category", b.category ?? "—"],
    ["Budget", b.budget != null ? formatCompactINR(b.budget) : "—"],
    ["Expected CPV", b.expectedCpv != null ? `₹${b.expectedCpv}` : "—"],
    ["Creators", b.creatorQty != null ? String(b.creatorQty) : "—"],
    ["Deliverables", b.deliverableQty != null ? String(b.deliverableQty) : "—"],
    ["Platform plan", b.platformPlan ?? "—"],
    ["Languages", b.languages ?? "—"],
    ["Regions", b.regions ?? "—"],
    ["Timeline", b.timelineStart || b.timelineEnd ? `${fmtDate(b.timelineStart)} to ${fmtDate(b.timelineEnd)}` : "—"],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <Link href="/briefs" className="text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400">← Briefs & strategy</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageHeadline title={b.title} subtitle={`${b.brand} · received ${fmtDateTime(b.receivedAt)}`} />
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900"><span className="text-slate-500 dark:text-slate-400">Given by (BD) </span><span className="font-semibold text-slate-900 dark:text-white">{b.createdByName}</span></span>
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900"><span className="text-slate-500 dark:text-slate-400">Given to (Brand Solutions) </span><span className="font-semibold text-slate-900 dark:text-white">{b.ownerName ?? "Anyone, not picked up"}</span></span>
          </div>
        </div>
        <div className="text-right">
          <Pill tone={STATUS_TONE[b.status]}>{b.status === "NEW" && b.ownerName ? "Assigned, not started" : STATUS_TEXT[b.status]}</Pill>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{b.fulfilledAt ? "Fulfilled in" : "Open for"} {formatHours(hrs)}</p>
        </div>
      </div>
      <ErrorBanner error={error} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SandboxCard title="Brief">
            <dl className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2 dark:bg-slate-800">
              {fields.map(([k, v]) => (
                <div key={k} className="bg-white px-5 py-3 dark:bg-slate-900">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{k}</dt>
                  <dd className="mt-0.5 break-words text-sm text-slate-900 dark:text-white">{v}</dd>
                </div>
              ))}
            </dl>
            {(b.productUrl || b.notes) && (
              <div className="space-y-1 border-t border-slate-100 px-5 py-3 text-sm dark:border-slate-800">
                {b.productUrl && <a href={b.productUrl} target="_blank" rel="noreferrer" className="block truncate text-indigo-600 hover:underline dark:text-indigo-400">{b.productUrl}</a>}
                {b.notes && <p className="text-slate-600 dark:text-slate-300">{b.notes}</p>}
              </div>
            )}
          </SandboxCard>

          <SandboxCard title={b.ownerName ? `Clarification chat · ${b.createdByName} ↔ ${b.ownerName}` : "Clarifications & history"}>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {b.messages.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500 dark:text-slate-400">Nothing yet.</li>}
              {b.messages.map((m: any) => (
                <li key={m.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white">{m.authorName}</span>
                    <Pill tone={m.kind === "QUESTION" ? "rose" : m.kind === "ANSWER" ? "gold" : "grey"}>{m.kind === "STATUS" ? "Status" : m.kind === "QUESTION" ? "Question" : m.kind === "ANSWER" ? "Answer" : "Note"}</Pill>
                    <span className="text-slate-400">{fmtDateTime(m.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{m.body}</p>
                </li>
              ))}
            </ul>
            {!closed && (isOwner || isAuthor) && (
              <form action={postBriefMessageForm} className="flex flex-col gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row dark:border-slate-800">
                <input type="hidden" name="briefId" value={b.id} />
                <input name="body" required className={inputClass} placeholder={isOwner ? `Ask ${b.createdByName} a question, or leave a note` : b.ownerName ? `Reply to ${b.ownerName}` : "Answer or add a note"} />
                <select name="kind" className={`${inputClass} sm:w-44`} defaultValue={isOwner ? "QUESTION" : b.status === "CLARIFICATION" ? "ANSWER" : "NOTE"}>
                  {isOwner && <option value="QUESTION">Ask question</option>}
                  {isAuthor && <option value="ANSWER">Answer</option>}
                  <option value="NOTE">Note</option>
                </select>
                <button className={primaryBtn}>Send</button>
              </form>
            )}
            {!closed && !isOwner && !isAuthor && (
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">Read only. Only {b.createdByName}{b.ownerName ? ` and ${b.ownerName}` : " and the Brand Solutions owner"} can write here.</p>
            )}
          </SandboxCard>
        </div>

        <div className="space-y-6">
          <SandboxCard title="Next step">
            <div className="space-y-4 px-5 py-4 text-sm">
              {b.campaign && (
                <p className="text-slate-700 dark:text-slate-300">
                  Campaign: <Link href={`/campaigns/${b.campaign.id}`} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{b.campaign.name}</Link>
                </p>
              )}
              {canWorkBrief(user.role) && (!b.ownerId || isOwner) && b.status === "NEW" && (
                <form action={startBriefForm}>
                  <input type="hidden" name="briefId" value={b.id} />
                  <button className={primaryBtn}>Start working</button>
                </form>
              )}
              {isOwner && b.status === "ON_HOLD" && (
                <form action={setBriefOutcomeForm}>
                  <input type="hidden" name="briefId" value={b.id} />
                  <input type="hidden" name="outcome" value="IN_PROGRESS" />
                  <button className={primaryBtn}>Resume</button>
                </form>
              )}
              {isOwner && !closed && b.status !== "ON_HOLD" && (
                <>
                  <div>
                    <p className={labelClass}>Create the campaign</p>
                    {canCreateCampaign(user.role) && <Link href="/campaigns/new" className={secondaryBtn}>Open New Campaign form ↗</Link>}
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Then link it here. Linking marks the brief fulfilled and asks the IR Manager to assign the team.</p>
                  </div>
                  <form action={linkBriefCampaignForm} className="space-y-2">
                    <input type="hidden" name="briefId" value={b.id} />
                    <select name="campaignId" required className={inputClass} defaultValue="">
                      <option value="" disabled>Choose your campaign…</option>
                      {linkable.map((c) => <option key={c.id} value={c.id}>{c.brand} · {c.name}</option>)}
                    </select>
                    <button className={primaryBtn}>Link campaign</button>
                  </form>
                  <form action={setBriefOutcomeForm} className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <input type="hidden" name="briefId" value={b.id} />
                    <p className={labelClass}>Or set an outcome</p>
                    <input name="note" required className={inputClass} placeholder="Reason" />
                    <div className="flex gap-2">
                      <button name="outcome" value="ON_HOLD" className={secondaryBtn}>On hold</button>
                      <button name="outcome" value="LOST" className={secondaryBtn}>Lost</button>
                    </div>
                  </form>
                </>
              )}
              {b.outcomeNote && <p className="text-xs text-slate-500 dark:text-slate-400">Outcome note: {b.outcomeNote}</p>}
              {user.role === "CXO" && <p className="text-xs text-slate-500 dark:text-slate-400">Read only for the CXO login.</p>}
            </div>
          </SandboxCard>
        </div>
      </div>
    </div>
  );
}
