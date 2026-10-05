import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeInternalCost } from "@/lib/rbac";
import { PLATFORM_SHORT_LABELS, type Platform } from "@/lib/constants";
import { effectiveDeadlineMs, pendingWithLabel } from "@/lib/irDashboard";
import MyCreatorsClient, { type CreatorRecord } from "@/components/dashboard/MyCreatorsClient";

// "Creator records" — every onboarded creator this IR Executive / Intern
// shortlisted, across campaigns. Same scope as the dashboard counts
// (sourcedByUserId = me, status ONBOARDED) so the two always reconcile.
// Linked from the dashboard's Deliverables card; ?status= pre-sets the
// deliverables filter (live / on_time / nearing / delayed).

const HOUR_MS = 60 * 60 * 1000;

function productLabel(statuses: (string | null)[]): string {
  const s = statuses.filter(Boolean) as string[];
  if (s.length === 0) return "Not required";
  if (s.every((x) => x === "DELIVERED")) return "Delivered";
  if (s.some((x) => x === "IN_TRANSIT")) return "In transit";
  return "Ordered";
}

function scriptLabel(statuses: (string | null)[]): string {
  if (statuses.length === 0) return "—";
  if (statuses.every((x) => x === "APPROVED")) return "Approved";
  if (statuses.some((x) => x === "SENT_FOR_APPROVAL")) return "In approval";
  return "In scripting";
}

function videoLabel(statuses: (string | null)[]): string {
  if (statuses.length === 0) return "—";
  if (statuses.every((x) => x === "APPROVED")) return "Approved";
  if (statuses.some((x) => x === "CHANGES_REQUESTED")) return "In changes";
  if (statuses.some((x) => x === "INTERNAL_APPROVAL" || x === "EXTERNAL_APPROVAL")) return "In approval";
  if (statuses.some((x) => x === "IN_SHOOT")) return "In shoot";
  return "Not started";
}

export default async function MyCreatorsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "IR_EXECUTIVE" && user.role !== "IR_INTERN") redirect("/dashboard");

  const sp = await searchParams;
  const showCost = canSeeInternalCost(user.role);

  const creators = (await (prisma as any).creator.findMany({
    where: { sourcedByUserId: user.id, status: "ONBOARDED" },
    select: {
      id: true,
      name: true,
      channelHandle: true,
      campaignId: true,
      campaign: { select: { name: true } },
      onboardedAt: true,
      goLiveDeadline: true,
      ballOwner: true,
      internalCost: true,
      finalQuotedCost: true,
      quotedCost: true,
      deliverables: {
        select: {
          platform: true,
          liveLink: true,
          productStatus: true,
          productEta: true,
          scriptStatus: true,
          scriptDocUrl: true,
          contentStatus: true,
          reviewLink: true,
        },
      },
    },
  })) as any[];

  const now = Date.now();
  const records: CreatorRecord[] = creators.map((cr) => {
    const dels = cr.deliverables as any[];
    const open = dels.filter((d) => !d.liveLink);
    const deadline = effectiveDeadlineMs(cr);
    let timing: "live" | "on_time" | "nearing" | "delayed" = "live";
    let note = "All deliverables live";
    if (open.length > 0) {
      if (deadline === null) {
        timing = "on_time";
        note = "No deadline set";
      } else if (deadline < now) {
        timing = "delayed";
        note = `Overdue since ${new Date(deadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
      } else if (deadline - now <= 24 * HOUR_MS) {
        timing = "nearing";
        note = `Due ${new Date(deadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
      } else {
        timing = "on_time";
        note = `Due ${new Date(deadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
      }
    }

    const counts = new Map<string, number>();
    for (const d of dels) {
      const code = PLATFORM_SHORT_LABELS[d.platform as Platform] ?? d.platform;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    const eta = dels.map((d) => d.productEta).filter(Boolean).sort()[0] as Date | undefined;

    return {
      id: cr.id,
      name: cr.name,
      handle: cr.channelHandle ?? "",
      campaignId: cr.campaignId,
      campaign: cr.campaign.name,
      deliverables: Array.from(counts.entries()).map(([c, n]) => `${n} ${c}`).join(" / ") || "—",
      product: productLabel(dels.map((d) => d.productStatus)),
      productEta: eta && productLabel(dels.map((d) => d.productStatus)) !== "Delivered" ? new Date(eta).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : null,
      script: scriptLabel(dels.map((d) => d.scriptStatus)),
      scriptLinks: dels.map((d) => d.scriptDocUrl).filter(Boolean) as string[],
      video: videoLabel(dels.map((d) => d.contentStatus)),
      videoLinks: dels.map((d) => d.liveLink || d.reviewLink).filter(Boolean) as string[],
      finalInternal: showCost ? cr.internalCost ?? null : null,
      finalQuoted: showCost ? cr.finalQuotedCost ?? cr.quotedCost ?? null : null,
      pendingWith: open.length > 0 ? pendingWithLabel(cr.ballOwner) : "—",
      note,
      timing,
      hasLive: dels.some((d) => !!d.liveLink),
      hasOpen: open.length > 0,
      deadlineMs: deadline,
    };
  });

  records.sort((a, b) => (a.deadlineMs ?? Number.MAX_SAFE_INTEGER) - (b.deadlineMs ?? Number.MAX_SAFE_INTEGER));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-8">
      <MyCreatorsClient records={records} showCost={showCost} initialStatus={sp.status ?? "all"} />
    </div>
  );
}
