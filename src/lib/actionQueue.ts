import { prisma } from "@/lib/prisma";
import { campaignVisibilityWhere, isClient } from "@/lib/rbac";
import { canReleaseFor } from "@/lib/gates";
import { formatCompactINR } from "@/lib/format";
import type { Role } from "@/lib/constants";

// My action queue (gap build): one list of what this login can act on now.
// Every item respects the spec's Role Actions (only the role that writes a
// field gets the task) and assignment scope (G13). Client items carry no
// clock or ages (G9). The CXO writes only the month lock, so its queue is the
// lock plus escalations to watch.

export type QueueAction =
  | { kind: "release"; deliverableId: string; gate: "SHOOT" | "PUBLISH" }
  | { kind: "startBrief"; briefId: string }
  | { kind: "ack"; notificationId: string };

export type QueueItem = {
  tone: "high" | "medium";
  group: string;
  title: string;
  reason: string;
  href: string;
  action?: QueueAction;
};

const DAY = 86400000;
const HOUR = 3600000;
const db = prisma as any;
const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await p;
  } catch {
    return fallback;
  }
};

export async function buildActionQueue(user: { id: string; role: Role; name: string }, now = Date.now()): Promise<QueueItem[]> {
  const items: QueueItem[] = [];
  const role = user.role;

  // Notifications that ask for action, for every login.
  const notes: any[] = await safe(
    db.notification.findMany({
      where: { ...(isClient(role) ? { clientId: user.id } : { userId: user.id }), actionRequired: { not: null }, acknowledgedAt: null },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    []
  );
  for (const n of notes) {
    if (role === "CXO" && !(n.entityType === "Escalation" || n.entityType === "Month" || /escalat|month/i.test(n.title))) continue;
    items.push({ tone: "medium", group: "Notifications", title: n.title, reason: `${n.actionRequired} · ${n.body}`.slice(0, 160), href: "/activity?show=action", action: { kind: "ack", notificationId: n.id } });
  }

  const campaigns = await prisma.campaign.findMany({
    where: { ...campaignVisibilityWhere(user), status: { not: "CANCELLED" } },
    select: {
      id: true, name: true, brand: true, status: true, reportPublished: true, createdAt: true,
      teamMembers: { select: { userId: true, roleOnCampaign: true } },
    },
  });
  const ids = campaigns.map((c) => c.id);
  const nameOf = new Map(campaigns.map((c) => [c.id, `${c.brand} · ${c.name}`]));
  const cmOn = new Set(campaigns.filter((c) => c.teamMembers.some((t) => t.userId === user.id && t.roleOnCampaign === "CAMPAIGN_MANAGER")).map((c) => c.id));

  if (role === "CLIENT") {
    const creators = await prisma.creator.findMany({
      where: { campaignId: { in: ids }, quotedCostPublished: true, status: { notIn: ["REJECTED", "CLIENT_REJECTED"] } },
      select: { name: true, campaignId: true, status: true, clientIntent: true, deliverables: { select: { scriptStatus: true, contentStatus: true } } },
    });
    for (const cr of creators) {
      if (cr.status !== "ONBOARDED" && (!cr.clientIntent || cr.clientIntent === "PENDING"))
        items.push({ tone: "medium", group: "Creators to review", title: `Review creator · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · choose Onboard, Negotiate or Cancel`, href: `/campaigns/${cr.campaignId}` });
      if (cr.status !== "ONBOARDED") continue;
      for (const d of cr.deliverables) {
        if (d.scriptStatus === "SENT_FOR_APPROVAL") items.push({ tone: "medium", group: "Approvals", title: `Approve script · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · approve or request changes with a reason`, href: `/campaigns/${cr.campaignId}` });
        if (d.contentStatus === "EXTERNAL_APPROVAL") items.push({ tone: "high", group: "Approvals", title: `Approve video · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · approve or request changes with a reason`, href: `/campaigns/${cr.campaignId}` });
      }
    }
    return items;
  }

  if (role === "CAMPAIGN_MANAGER") {
    const mine = Array.from(cmOn);
    const creators = await safe(
      db.creator.findMany({
        where: { campaignId: { in: mine } },
        select: {
          id: true, name: true, campaignId: true, status: true, internalCost: true, quotedCost: true, createdAt: true, pricingQueueEnteredAt: true,
          ballOwner: true, pauseRequestedAt: true, pauseConfirmedAt: true, pauseReason: true,
          deliverables: { select: { id: true, platform: true, scriptStatus: true, contentStatus: true, liveLink: true, lastTrackedAt: true, releases: { select: { kind: true } } } },
        },
      }),
      [] as any[]
    );
    for (const cr of creators) {
      if (cr.internalCost != null && cr.quotedCost == null && !["REJECTED", "CLIENT_REJECTED"].includes(cr.status)) {
        const h = (now - new Date(cr.pricingQueueEnteredAt ?? cr.createdAt).getTime()) / HOUR;
        items.push({ tone: h >= 96 ? "high" : "medium", group: "Pricing", title: `Vet and price · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · in queue ${Math.round(h)}h`, href: "/pricing-queue" });
      }
      if (cr.status !== "ONBOARDED") continue;
      if (cr.pauseRequestedAt && !cr.pauseConfirmedAt)
        items.push({ tone: "high", group: "Pause", title: `Confirm or reject pause · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · ${cr.pauseReason ?? "reason not given"}`, href: `/campaigns/${cr.campaignId}` });
      for (const d of cr.deliverables) {
        if (d.contentStatus === "INTERNAL_APPROVAL") items.push({ tone: "medium", group: "QC", title: `QC video · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · waiting on internal approval`, href: `/campaigns/${cr.campaignId}` });
        for (const gate of ["SHOOT", "PUBLISH"] as const) {
          if (canReleaseFor(gate, d).ok)
            items.push({ tone: "medium", group: "Release gates", title: `${gate === "SHOOT" ? "Release for shoot" : "Release for publishing"} · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · ${gate === "SHOOT" ? "script approved" : "video approved"}`, href: `/campaign-gates/${cr.campaignId}`, action: { kind: "release", deliverableId: d.id, gate } });
        }
      }
      if (cr.ballOwner === "CLIENT") items.push({ tone: "medium", group: "Client chase", title: `Chase client · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · waiting on client`, href: "/action-tracker" });
    }
    const invs: any[] = await safe(
      db.creatorInvoice.findMany({
        where: { campaignId: { in: mine }, status: "VALIDATED" },
        select: { amount: true, campaignId: true, cmApprovedAt: true, approvedTermsVersion: true, creator: { select: { name: true, paymentTerms: { select: { termsVersion: true } } } } },
      }),
      []
    );
    for (const i of invs.filter((i) => !i.cmApprovedAt || i.approvedTermsVersion !== i.creator.paymentTerms?.termsVersion))
      items.push({ tone: "medium", group: "Payables", title: `Approve invoice · ${i.creator.name}`, reason: `${nameOf.get(i.campaignId)} · ${formatCompactINR(i.amount)} validated by Finance`, href: "/finance-ledger" });
    for (const c of campaigns.filter((c) => cmOn.has(c.id) && c.status === "ACTIVE" && !c.reportPublished))
      items.push({ tone: "medium", group: "Reporting", title: `Publish report · ${c.name}`, reason: `${c.brand} · add commentary and publish once every live deliverable is tracked`, href: `/campaigns/${c.id}` });
    return items;
  }

  if (role === "IR_EXECUTIVE" || role === "IR_INTERN") {
    const creators = await safe(
      db.creator.findMany({
        where: { campaignId: { in: ids }, pocUserId: user.id, status: "ONBOARDED" },
        select: {
          id: true, name: true, campaignId: true, goLiveDeadline: true, ballOwner: true, payoutInvoiceReceived: true,
          deliverables: { select: { id: true, liveLink: true, scriptStatus: true, contentStatus: true, releases: { select: { kind: true } } } },
        },
      }),
      [] as any[]
    );
    for (const cr of creators) {
      const notLive = cr.deliverables.filter((d: any) => !d.liveLink);
      if (cr.goLiveDeadline && new Date(cr.goLiveDeadline).getTime() < now && notLive.length)
        items.push({ tone: "high", group: "Deadlines", title: `Past deadline · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · ${notLive.length} deliverable${notLive.length === 1 ? "" : "s"} not live`, href: `/campaigns/${cr.campaignId}` });
      for (const d of cr.deliverables) {
        const rel = (k: string) => d.releases.some((r: any) => r.kind === k);
        if (rel("PUBLISH") && !d.liveLink) items.push({ tone: "medium", group: "Execution", title: `Add live link · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · released for publishing`, href: `/campaigns/${cr.campaignId}` });
        else if (rel("SHOOT") && !d.contentStatus) items.push({ tone: "medium", group: "Execution", title: `Get the video · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · released for shoot`, href: `/campaigns/${cr.campaignId}` });
        else if (d.scriptStatus === "FEEDBACK" || d.contentStatus === "CHANGES") items.push({ tone: "medium", group: "Execution", title: `Changes requested · ${cr.name}`, reason: `${nameOf.get(cr.campaignId)} · send the revision`, href: `/campaigns/${cr.campaignId}` });
      }
    }
    return items;
  }

  if (role === "FINANCE") {
    const invs: any[] = await safe(
      db.creatorInvoice.findMany({
        where: { campaignId: { in: ids }, status: { not: "REJECTED" } },
        select: { id: true, amount: true, status: true, dueDate: true, campaignId: true, cmApprovedAt: true, approvedTermsVersion: true, creator: { select: { name: true, paymentTerms: { select: { termsVersion: true } } } }, payouts: { select: { amount: true } } },
      }),
      []
    );
    for (const i of invs) {
      const paid = i.payouts.reduce((s: number, p: any) => s + p.amount, 0);
      if (i.status === "RECEIVED") items.push({ tone: "medium", group: "Creator invoices", title: `Validate invoice · ${i.creator.name}`, reason: `${nameOf.get(i.campaignId)} · ${formatCompactINR(i.amount)}`, href: "/finance-ledger" });
      else if (i.status === "VALIDATED" && i.cmApprovedAt && i.approvedTermsVersion === i.creator.paymentTerms?.termsVersion && paid + 0.5 < i.amount)
        items.push({ tone: i.dueDate && new Date(i.dueDate).getTime() < now ? "high" : "medium", group: "Payouts", title: `Record payout · ${i.creator.name}`, reason: `${nameOf.get(i.campaignId)} · ${formatCompactINR(i.amount - paid)} left`, href: "/finance-ledger" });
    }
    const closures: any[] = await safe(db.campaignClosure.findMany({ where: { campaignId: { in: ids }, executionClosedAt: { not: null }, financeSignedOffAt: null }, select: { campaignId: true } }), []);
    for (const c of closures) items.push({ tone: "medium", group: "Closure", title: `Financial sign-off · ${nameOf.get(c.campaignId)}`, reason: "Execution closed by the Campaign Manager", href: `/campaign-gates/${c.campaignId}` });
    return items;
  }

  if (role === "BRAND_SOLUTIONS") {
    const reopen = await prisma.creator.findMany({
      where: { campaignId: { in: ids }, OR: [{ pendingQuotedCostEdit: { not: null } }, { pendingFinalCostEdit: { not: null } }] },
      select: { name: true, campaignId: true },
    });
    for (const r of reopen) items.push({ tone: "high", group: "Approvals", title: `Approve cost reopen · ${r.name}`, reason: `${nameOf.get(r.campaignId)} · reason logged by the Campaign Manager`, href: `/campaigns/${r.campaignId}` });
    const briefs: any[] = await safe(db.brief.findMany({ where: { OR: [{ ownerId: null, status: "NEW" }, { ownerId: user.id, status: { in: ["IN_PROGRESS"] } }] }, select: { id: true, title: true, brand: true, status: true, ownerId: true } }), []);
    for (const b of briefs) {
      if (!b.ownerId) items.push({ tone: "medium", group: "Briefs", title: `New brief · ${b.brand}`, reason: b.title, href: `/briefs/${b.id}`, action: { kind: "startBrief", briefId: b.id } });
      else items.push({ tone: "medium", group: "Briefs", title: `Create and link campaign · ${b.brand}`, reason: b.title, href: `/briefs/${b.id}` });
    }
    const invs: any[] = await safe(db.clientInvoice.findMany({ where: { campaignId: { in: ids } }, select: { campaignId: true, invoiceAmount: true, amountReceived: true, invoiceRaisedAt: true, invoiceNumber: true } }), []);
    for (const i of invs) {
      const due = i.invoiceAmount - (i.amountReceived ?? 0);
      if (due > 0.5 && i.invoiceRaisedAt && now - new Date(i.invoiceRaisedAt).getTime() > 45 * DAY)
        items.push({ tone: "medium", group: "Client cash", title: `Follow up receivable · ${nameOf.get(i.campaignId)}`, reason: `${formatCompactINR(due)} due on invoice ${i.invoiceNumber ?? ""}`, href: "/client-cash" });
    }
    return items;
  }

  if (role === "BUSINESS_DEVELOPMENT") {
    const briefs: any[] = await safe(db.brief.findMany({ where: { createdById: user.id, status: "CLARIFICATION" }, select: { id: true, title: true, brand: true } }), []);
    for (const b of briefs) items.push({ tone: "high", group: "Briefs", title: `Answer clarification · ${b.brand}`, reason: b.title, href: `/briefs/${b.id}` });
    return items;
  }

  if (role === "IR_MANAGER") {
    for (const c of campaigns.filter((c) => c.status === "DRAFT" && !c.teamMembers.some((t) => t.roleOnCampaign === "CAMPAIGN_MANAGER")))
      items.push({ tone: now - c.createdAt.getTime() > 2 * DAY ? "high" : "medium", group: "Team assignment", title: `Assign team · ${c.name}`, reason: `${c.brand} · brief published ${Math.floor((now - c.createdAt.getTime()) / DAY)}d ago`, href: `/campaigns/${c.id}` });
    const esc = await prisma.escalation.findMany({ where: { status: "OPEN", ownerId: null }, select: { id: true, title: true, severity: true, campaignId: true, createdAt: true } });
    for (const e of esc) items.push({ tone: e.severity === "HIGH" ? "high" : "medium", group: "Escalations", title: `Own or reassign · ${e.title}`, reason: `${nameOf.get(e.campaignId) ?? "Campaign"} · open ${Math.floor((now - e.createdAt.getTime()) / DAY)}d`, href: "/escalations" });
    const stuck = await prisma.creator.findMany({ where: { campaignId: { in: ids }, internalCost: { not: null }, quotedCost: null, status: { notIn: ["REJECTED", "CLIENT_REJECTED"] } }, select: { name: true, campaignId: true, createdAt: true, pricingQueueEnteredAt: true } });
    for (const s of stuck) {
      const h = (now - (s.pricingQueueEnteredAt ?? s.createdAt).getTime()) / HOUR;
      if (h >= 96) items.push({ tone: "high", group: "Pricing past 96h", title: `Unstick pricing · ${s.name}`, reason: `${nameOf.get(s.campaignId)} · ${Math.round(h)}h in the queue`, href: "/pricing-queue" });
    }
    return items;
  }

  if (role === "CXO") {
    const d = new Date(now);
    const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    const key = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
    const month = await prisma.month.findFirst({ where: { month: key }, select: { status: true } });
    if (month?.status !== "LOCKED") items.push({ tone: "medium", group: "Month lock", title: `Lock ${key} after the Accounts audit`, reason: "Only locked months feed org analytics and scorecards", href: "/admin/months" });
    const esc = await prisma.escalation.findMany({ where: { status: { not: "CLOSED" }, severity: "HIGH" }, select: { title: true, campaignId: true, createdAt: true } });
    for (const e of esc) items.push({ tone: "high", group: "Escalations to watch", title: e.title, reason: `${nameOf.get(e.campaignId) ?? "Campaign"} · open ${Math.floor((now - e.createdAt.getTime()) / DAY)}d`, href: "/escalations" });
  }
  return items;
}
