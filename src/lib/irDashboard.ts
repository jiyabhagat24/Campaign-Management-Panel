import { PLATFORM_SHORT_LABELS, PLATFORM_LABELS, type Platform } from "@/lib/constants";

// Builders for the IR Executive / IR Intern dashboard's "Creator execution
// snapshot", "Action required" and "Upcoming 7 days" sections. Pure
// functions over the same onboarded-creator records dashboard/page.tsx
// already fetches, so none of this adds a query.

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_GO_LIVE_DAYS = 15;

export type IrDeliverable = {
  id: string;
  platform: string;
  liveLink: string | null;
  productStatus: string | null;
  productEta: Date | null;
  scriptStatus: string | null;
  scriptApprovalDeadline: Date | null;
  contentStatus: string | null;
  videoDraftDeadline: Date | null;
};

export type IrCreator = {
  id: string;
  name: string;
  campaignId: string;
  campaign: { name: string };
  onboardedAt: Date | null;
  goLiveDeadline: Date | null;
  ballOwner: string;
  payoutInvoiceRaised: boolean;
  payoutPaymentStatus: string;
  deliverables: IrDeliverable[];
};

export type SnapshotBucket = { label: string; count: number; tone: "blue" | "amber" | "green" | "purple" | "rose" };
export type SnapshotGroup = { total: number; items: SnapshotBucket[] };

export type Snapshot = {
  onboardedCreators: number;
  totalDeliverables: number;
  formats: { code: string; label: string; count: number }[];
  product: SnapshotGroup;
  script: SnapshotGroup;
  video: SnapshotGroup;
  pendingCreator: number;
  pendingClient: number;
};

export type ActionRow = {
  id: string;
  priority: "Critical" | "High" | "Medium";
  title: string;
  sub: string;
  pendingWith: string;
  status: string;
  href: string;
};

export type ActionRequired = {
  chips: { delayed: number; due24: number; followups: number; financeBlockers: number };
  total: number;
  rows: ActionRow[];
};

export type UpcomingItem = {
  id: string;
  kind: "script" | "video" | "product" | "post";
  label: string;
  name: string;
  sub: string;
  note: string;
  href: string;
};

export type Upcoming = {
  total: number;
  days: { key: string; day: string; month: string; items: UpcomingItem[] }[];
};

export function effectiveDeadlineMs(cr: { goLiveDeadline: Date | null; onboardedAt: Date | null }): number | null {
  if (cr.goLiveDeadline) return new Date(cr.goLiveDeadline).getTime();
  if (cr.onboardedAt) return new Date(cr.onboardedAt).getTime() + DEFAULT_GO_LIVE_DAYS * DAY_MS;
  return null;
}

export function pendingWithLabel(ballOwner: string): string {
  if (ballOwner === "CREATOR") return "Creator";
  if (ballOwner === "CLIENT") return "Client";
  return "Internal team";
}

function relativeDelay(ms: number): string {
  const hours = Math.round(ms / HOUR_MS);
  if (hours >= 24) return `${Math.floor(hours / 24)}d`;
  return `${Math.max(hours, 1)}h`;
}

export function buildSnapshot(creators: IrCreator[]): Snapshot {
  const dels = creators.flatMap((c) => c.deliverables);

  const formatCounts = new Map<string, number>();
  for (const d of dels) formatCounts.set(d.platform, (formatCounts.get(d.platform) ?? 0) + 1);
  const formats = (Object.keys(PLATFORM_SHORT_LABELS) as Platform[])
    .filter((p) => p !== "INSTAGRAM_STORY" || (formatCounts.get(p) ?? 0) > 0)
    .map((p) => ({ code: PLATFORM_SHORT_LABELS[p], label: PLATFORM_LABELS[p], count: formatCounts.get(p) ?? 0 }));

  const count = (pred: (d: IrDeliverable) => boolean) => dels.filter(pred).length;

  const productDels = dels.filter((d) => d.productStatus);
  const product: SnapshotGroup = {
    total: productDels.length,
    items: [
      { label: "Ordered", count: count((d) => d.productStatus === "ORDERED"), tone: "blue" },
      { label: "In transit", count: count((d) => d.productStatus === "IN_TRANSIT"), tone: "amber" },
      { label: "Delivered", count: count((d) => d.productStatus === "DELIVERED"), tone: "green" },
      { label: "Installation pending", count: count((d) => d.productStatus === "INSTALLATION_PENDING"), tone: "purple" },
      { label: "Installed", count: count((d) => d.productStatus === "INSTALLED"), tone: "green" },
    ].filter((b) => b.count > 0) as SnapshotBucket[],
  };

  const script: SnapshotGroup = {
    total: dels.length,
    items: [
      { label: "In scripting", count: count((d) => !d.scriptStatus || d.scriptStatus === "FEEDBACK" || d.scriptStatus === "REVISED"), tone: "blue" },
      { label: "In approval", count: count((d) => d.scriptStatus === "SENT_FOR_APPROVAL"), tone: "amber" },
      { label: "Approved", count: count((d) => d.scriptStatus === "APPROVED"), tone: "green" },
    ] as SnapshotBucket[],
  };

  const videoDels = dels.filter((d) => d.contentStatus);
  const video: SnapshotGroup = {
    total: videoDels.length,
    items: [
      { label: "In shoot", count: count((d) => d.contentStatus === "IN_SHOOT"), tone: "blue" },
      { label: "In approval", count: count((d) => d.contentStatus === "INTERNAL_APPROVAL" || d.contentStatus === "EXTERNAL_APPROVAL"), tone: "amber" },
      { label: "In changes", count: count((d) => d.contentStatus === "CHANGES_REQUESTED"), tone: "purple" },
      { label: "Approved", count: count((d) => d.contentStatus === "APPROVED"), tone: "green" },
    ].filter((b) => b.count > 0) as SnapshotBucket[],
  };

  // Creators that still have something not live — the ones "ball owner"
  // actually matters for.
  const open = creators.filter((c) => c.deliverables.some((d) => !d.liveLink));

  return {
    onboardedCreators: creators.length,
    totalDeliverables: dels.length,
    formats,
    product,
    script,
    video,
    pendingCreator: open.filter((c) => c.ballOwner === "CREATOR").length,
    pendingClient: open.filter((c) => c.ballOwner === "CLIENT").length,
  };
}

export function buildActions(creators: IrCreator[], now: number, includeFinance: boolean): ActionRequired {
  const rows: (ActionRow & { sort: number })[] = [];
  let delayedDeliverables = 0;
  let due24Deliverables = 0;
  let followups = 0;
  let financeBlockers = 0;

  for (const cr of creators) {
    const open = cr.deliverables.filter((d) => !d.liveLink);
    const deadline = effectiveDeadlineMs(cr);
    const sub = `${cr.name} · ${cr.campaign.name}`;
    const href = `/campaigns/${cr.campaignId}`;
    const pendingWith = pendingWithLabel(cr.ballOwner);

    if (open.length > 0 && deadline !== null) {
      const remaining = deadline - now;
      const scriptPending = open.some((d) => d.scriptStatus !== "APPROVED");
      const what = scriptPending ? "Script approval" : "Video delivery";
      const plural = open.length > 1 ? ` (${open.length} deliverables)` : "";
      if (remaining < 0) {
        delayedDeliverables += open.length;
        rows.push({ id: `late-${cr.id}`, priority: "Critical", title: `${what} overdue${plural}`, sub, pendingWith, status: `Delayed ${relativeDelay(-remaining)}`, href, sort: remaining });
      } else if (remaining <= 24 * HOUR_MS) {
        due24Deliverables += open.length;
        rows.push({ id: `soon-${cr.id}`, priority: "High", title: `${what} due soon${plural}`, sub, pendingWith, status: `Due in ${relativeDelay(remaining)}`, href, sort: remaining });
      }
    }

    const awaitingClient = open.some((d) => d.scriptStatus === "SENT_FOR_APPROVAL" || d.contentStatus === "EXTERNAL_APPROVAL");
    if (cr.ballOwner === "CLIENT" && awaitingClient) {
      followups += 1;
      rows.push({ id: `follow-${cr.id}`, priority: "Medium", title: "Client approval follow-up", sub, pendingWith: "Client", status: "Awaiting reply", href, sort: Number.MAX_SAFE_INTEGER - 1 });
    }

    if (includeFinance && cr.deliverables.some((d) => d.liveLink) && !cr.payoutInvoiceRaised && cr.payoutPaymentStatus !== "PAID") {
      financeBlockers += 1;
      rows.push({ id: `fin-${cr.id}`, priority: "High", title: "Invoice required for payment", sub, pendingWith: "Creator", status: "Invoice not raised", href, sort: Number.MAX_SAFE_INTEGER });
    }
  }

  const order = { Critical: 0, High: 1, Medium: 2 } as const;
  rows.sort((a, b) => order[a.priority] - order[b.priority] || a.sort - b.sort);

  return {
    chips: { delayed: delayedDeliverables, due24: due24Deliverables, followups, financeBlockers },
    total: rows.length,
    rows: rows.slice(0, 20).map(({ sort: _sort, ...r }) => r),
  };
}

export function buildUpcoming(creators: IrCreator[], now: number): Upcoming {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = startMs + 8 * DAY_MS; // today + the next 7 days

  type Raw = UpcomingItem & { at: number };
  const items: Raw[] = [];
  const within = (d: Date | null) => {
    if (!d) return null;
    const t = new Date(d).getTime();
    return t >= startMs && t < endMs ? t : null;
  };

  for (const cr of creators) {
    const href = `/campaigns/${cr.campaignId}`;
    const open = cr.deliverables.filter((d) => !d.liveLink);
    if (open.length > 0) {
      const t = within(cr.goLiveDeadline) ?? (cr.goLiveDeadline ? null : within(effectiveDeadlineMs(cr) !== null ? new Date(effectiveDeadlineMs(cr)!) : null));
      if (t !== null) items.push({ id: `post-${cr.id}`, kind: "post", label: "Content posting", name: cr.name, sub: cr.campaign.name, note: `${open.length} deliverable${open.length > 1 ? "s" : ""} to go live`, href, at: t });
    }
    for (const d of cr.deliverables) {
      const code = PLATFORM_SHORT_LABELS[d.platform as Platform] ?? d.platform;
      const eta = within(d.productEta);
      if (eta !== null && d.productStatus !== "DELIVERED") {
        items.push({ id: `prod-${d.id}`, kind: "product", label: "Product delivery", name: cr.name, sub: cr.campaign.name, note: d.productStatus === "IN_TRANSIT" ? "Dispatch in transit" : "Delivery expected", href, at: eta });
      }
      const sd = within(d.scriptApprovalDeadline);
      if (sd !== null && d.scriptStatus !== "APPROVED") {
        items.push({ id: `script-${d.id}`, kind: "script", label: "Script due", name: cr.name, sub: cr.campaign.name, note: `${code} script approval`, href, at: sd });
      }
      const vd = within(d.videoDraftDeadline);
      if (vd !== null && !d.liveLink && d.contentStatus !== "APPROVED") {
        items.push({ id: `video-${d.id}`, kind: "video", label: "Video submission", name: cr.name, sub: cr.campaign.name, note: `${code} first cut expected`, href, at: vd });
      }
    }
  }

  items.sort((a, b) => a.at - b.at);

  const byDay = new Map<string, { key: string; day: string; month: string; items: UpcomingItem[] }>();
  for (const { at, ...item } of items) {
    const d = new Date(at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay.has(key)) {
      byDay.set(key, {
        key,
        day: String(d.getDate()).padStart(2, "0"),
        month: d.toLocaleString("en-IN", { month: "short" }).toUpperCase(),
        items: [],
      });
    }
    byDay.get(key)!.items.push(item);
  }

  return { total: items.length, days: Array.from(byDay.values()) };
}
