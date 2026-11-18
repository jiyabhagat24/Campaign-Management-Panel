import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, canSeeActivityTrail, isClient } from "@/lib/rbac";
import { PageHeadline, SandboxCard } from "@/components/finance/SandboxUi";
import { Pill, fmtDateTime, primaryBtn, secondaryBtn } from "@/components/gaps/Ui";
import { acknowledgeNotificationForm, markAllNotificationsReadForm } from "@/lib/notificationActions";

// Activity & notifications (gap build). Everyone sees their own
// notifications, with an Acknowledge button on the ones that need action.
// The CXO feed carries only escalations and month close (spec Notifications).
// The team activity trail is internal only, scoped to assigned campaigns
// (G13), and never shown to a client (G9).

const human = (a: string) => a.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
const cxoRelevant = (n: { title: string; entityType?: string | null }) =>
  n.entityType === "Escalation" || n.entityType === "Month" || /escalat|month/i.test(n.title);

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { show } = await searchParams;
  const client = isClient(user.role);

  let notifications: any[] = await prisma.notification.findMany({
    where: client ? { clientId: user.id } : { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
  if (user.role === "CXO") notifications = notifications.filter(cxoRelevant);
  const needAction = notifications.filter((n) => n.actionRequired && !n.acknowledgedAt);
  const listed = show === "action" ? needAction : show === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const activity = canSeeActivityTrail(user.role)
    ? await prisma.activityLog.findMany({
        where: { campaign: campaignVisibilityWhere(user) },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { id: true, actorName: true, action: true, entityType: true, createdAt: true, campaign: { select: { id: true, name: true, brand: true } } },
      })
    : [];

  const tab = (key: string | undefined, label: string, count: number) => (
    <Link
      href={key ? `/activity?show=${key}` : "/activity"}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${show === key ? "bg-slate-900 text-white dark:bg-indigo-600" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
    >
      {label} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
    </Link>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline
        title="What changed, and what needs you."
        subtitle={user.role === "CXO" ? "Escalations and month close only, by design" : client ? "Updates on your campaigns" : "Your notifications and your campaigns' activity"}
      />
      <div className={`grid grid-cols-1 gap-6 ${activity.length || canSeeActivityTrail(user.role) ? "lg:grid-cols-5" : ""}`}>
        <div className={canSeeActivityTrail(user.role) ? "lg:col-span-3" : ""}>
          <SandboxCard
            title="Notifications"
            aside={
              <div className="flex flex-wrap items-center gap-1">
                {tab(undefined, "All", notifications.length)}
                {tab("action", "Needs action", needAction.length)}
                {tab("unread", "Unread", notifications.filter((n) => !n.read).length)}
                <form action={markAllNotificationsReadForm}><button className={secondaryBtn}>Mark all read</button></form>
              </div>
            }
          >
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {listed.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nothing here.</li>}
              {listed.map((n) => (
                <li key={n.id} className={`flex items-start gap-3 px-5 py-3 ${n.read ? "" : "bg-indigo-50/40 dark:bg-indigo-950/20"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{n.title}</p>
                      {n.actionRequired && !n.acknowledgedAt && <Pill tone="rose">{n.actionRequired}</Pill>}
                      {n.acknowledgedAt && <Pill tone="grey">Acknowledged</Pill>}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{n.body}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                  </div>
                  {n.actionRequired && !n.acknowledgedAt && (
                    <form action={acknowledgeNotificationForm}>
                      <input type="hidden" name="id" value={n.id} />
                      <button className={primaryBtn}>Acknowledge</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </SandboxCard>
        </div>
        {canSeeActivityTrail(user.role) && (
          <div className="lg:col-span-2">
            <SandboxCard title="Campaign activity" footer="Latest 60 changes on campaigns you're assigned to.">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {activity.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No activity yet.</li>}
                {activity.map((a) => (
                  <li key={a.id} className="px-5 py-2.5">
                    <p className="text-sm text-slate-800 dark:text-slate-200"><span className="font-semibold">{a.actorName}</span> · {human(a.action)}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      <Link href={`/campaigns/${a.campaign.id}`} className="hover:underline">{a.campaign.brand} · {a.campaign.name}</Link> · {fmtDateTime(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </SandboxCard>
          </div>
        )}
      </div>
    </div>
  );
}
