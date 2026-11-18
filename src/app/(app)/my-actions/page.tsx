import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { buildActionQueue, type QueueItem } from "@/lib/actionQueue";
import { Kpi, PageHeadline, SandboxCard } from "@/components/finance/SandboxUi";
import { Pill, primaryBtn } from "@/components/gaps/Ui";
import { releaseDeliverableForm } from "@/lib/gateActions";
import { startBriefForm } from "@/lib/briefActions";
import { acknowledgeNotificationForm } from "@/lib/notificationActions";
import { ROLE_DISPLAY_NAMES } from "@/lib/constants";

// My action queue (gap build). One list of what this login can act on now,
// grouped, with the button inline where the action is a single press.

const HEADLINES: Record<string, string> = {
  CXO: "The organisation, at a glance.",
  FINANCE: "Keep every rupee accounted for.",
  CLIENT: "Your campaigns. Your next decisions.",
  BRAND_SOLUTIONS: "From strategy to execution.",
  BUSINESS_DEVELOPMENT: "Your briefs and client pipeline.",
  IR_MANAGER: "Clear bottlenecks. Keep teams moving.",
  CAMPAIGN_MANAGER: "Keep the next approval moving.",
  IR_EXECUTIVE: "Your creators. Your next move.",
  IR_INTERN: "Your creators. Your next move.",
};

function InlineAction({ item }: { item: QueueItem }) {
  const a = item.action;
  if (!a) return <Link href={item.href} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Open →</Link>;
  if (a.kind === "release")
    return (
      <form action={releaseDeliverableForm}>
        <input type="hidden" name="deliverableId" value={a.deliverableId} />
        <input type="hidden" name="kind" value={a.gate} />
        <input type="hidden" name="back" value="/my-actions" />
        <button className={primaryBtn}>{a.gate === "SHOOT" ? "Release for shoot" : "Release for publishing"}</button>
      </form>
    );
  if (a.kind === "startBrief")
    return (
      <form action={startBriefForm}>
        <input type="hidden" name="briefId" value={a.briefId} />
        <button className={primaryBtn}>Start working</button>
      </form>
    );
  return (
    <form action={acknowledgeNotificationForm}>
      <input type="hidden" name="id" value={a.notificationId} />
      <button className={primaryBtn}>Acknowledge</button>
    </form>
  );
}

export default async function MyActionsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  const items = await buildActionQueue(user);
  const groups = Array.from(new Set(items.map((i) => i.group)));
  const high = items.filter((i) => i.tone === "high").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <PageHeadline title={HEADLINES[user.role] ?? "My action queue"} subtitle={`My action queue · ${ROLE_DISPLAY_NAMES[user.role] ?? user.role}`} />
      {error && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi emphasis label="Actions waiting" value={items.length} hint="Everything you can move right now" />
        <Kpi label="Urgent" value={high} hint="Past a deadline or a 96-hour window" />
        <Kpi label="Groups" value={groups.length} hint={groups.slice(0, 3).join(", ") || "Nothing open"} />
      </div>
      {items.length === 0 && (
        <SandboxCard title="All clear">
          <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nothing is waiting on you right now.</p>
        </SandboxCard>
      )}
      {groups.map((g) => (
        <SandboxCard key={g} title={g} aside={<span className="text-xs text-slate-500 dark:text-slate-400">{items.filter((i) => i.group === g).length}</span>}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.filter((i) => i.group === g).map((i, idx) => (
              <li key={idx} className="flex items-center gap-3 px-5 py-3">
                <Pill tone={i.tone === "high" ? "rose" : "gold"}>{i.tone === "high" ? "Urgent" : "Next"}</Pill>
                <Link href={i.href} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">{i.title}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{i.reason}</span>
                </Link>
                <InlineAction item={i} />
              </li>
            ))}
          </ul>
        </SandboxCard>
      ))}
    </div>
  );
}
