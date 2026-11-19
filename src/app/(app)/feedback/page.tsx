import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClient } from "@/lib/rbac";
import { ROLE_DISPLAY_NAMES, type Role } from "@/lib/constants";
import { Kpi, PageHeadline, SandboxCard, pageClass } from "@/components/finance/SandboxUi";
import { DbNotice, Pill, fmtDateTime, secondaryBtn } from "@/components/gaps/Ui";
import { setFeedbackStatusForm } from "@/lib/feedbackActions";
import FeedbackForm from "./feedback-form";

// Team feedback board. Every internal login can post and sees every post.
// Clients are kept out (no sidebar link, and redirected here).

const db = prisma as any;

type FeedbackRow = {
  id: string;
  body: string;
  category: string;
  status: string;
  authorName: string;
  authorRole: string;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  createdAt: Date;
};

const CATEGORY_LABEL: Record<string, string> = { GENERAL: "General", IDEA: "Idea", ISSUE: "Issue" };
const CATEGORY_TONE: Record<string, "grey" | "gold" | "rose"> = { GENERAL: "grey", IDEA: "gold", ISSUE: "rose" };
const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
] as const;

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (isClient(user.role)) redirect("/campaigns");
  const { show } = await searchParams;
  const filter = show === "open" || show === "done" ? show : "all";

  let rows: FeedbackRow[] | null = null;
  try {
    rows = await db.teamFeedback.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  } catch {
    rows = null; // table not created yet
  }

  if (!rows) {
    return (
      <div className={pageClass}>
        <PageHeadline title="Team feedback." subtitle="Share what's working and what isn't. Everyone on the team can see it." />
        <DbNotice what="The feedback board" />
      </div>
    );
  }

  const open = rows.filter((r) => r.status !== "DONE").length;
  const done = rows.length - open;
  const visible = rows.filter((r) => (filter === "open" ? r.status !== "DONE" : filter === "done" ? r.status === "DONE" : true));

  return (
    <div className={pageClass}>
      <PageHeadline title="Team feedback." subtitle="Share what's working and what isn't. Everyone on the team can see it." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi emphasis label="Open" value={open} hint="Waiting to be picked up" />
        <Kpi label="Done" value={done} hint="Marked as handled" />
        <Kpi label="Total" value={rows.length} hint="Everything posted so far" />
      </div>

      <SandboxCard title="Post feedback" aside={<span className="text-xs text-slate-500 dark:text-slate-400">Posting as {user.name}</span>}>
        <FeedbackForm />
      </SandboxCard>

      <SandboxCard
        title="All feedback"
        aside={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={f.key === "all" ? "/feedback" : `/feedback?show=${f.key}`}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    filter === f.key
                      ? "bg-slate-900 text-white dark:bg-indigo-600"
                      : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{visible.length} records</span>
          </div>
        }
      >
        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {rows.length === 0 ? "No feedback yet. Be the first to post." : "Nothing here for this filter."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((r) => {
              const isDone = r.status === "DONE";
              return (
                <li key={r.id} className="flex items-start gap-4 px-5 py-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600/15 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {r.authorName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{r.authorName}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {ROLE_DISPLAY_NAMES[r.authorRole as Role] ?? r.authorRole} · {fmtDateTime(r.createdAt)}
                      </span>
                      <Pill tone={CATEGORY_TONE[r.category] ?? "grey"}>{CATEGORY_LABEL[r.category] ?? r.category}</Pill>
                    </div>
                    <p className={`mt-1 whitespace-pre-wrap break-words text-sm ${isDone ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}`}>
                      {r.body}
                    </p>
                    {isDone && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Done{r.resolvedByName ? ` by ${r.resolvedByName}` : ""}{r.resolvedAt ? ` · ${fmtDateTime(r.resolvedAt)}` : ""}
                      </p>
                    )}
                  </div>
                  <form action={setFeedbackStatusForm} className="flex-shrink-0">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value={isDone ? "OPEN" : "DONE"} />
                    <button className={secondaryBtn}>{isDone ? "Reopen" : "Mark done"}</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </SandboxCard>
    </div>
  );
}
