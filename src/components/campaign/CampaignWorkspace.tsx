"use client";

import { Fragment, useState } from "react";
import type { Role } from "@/lib/constants";
import { PLATFORM_LABELS } from "@/lib/constants";
import StatusBadge from "@/components/StatusBadge";
import CommunicationsThread from "@/components/campaign/CommunicationsThread";
import {
  addCreator,
  rejectCreator,
  clientReviewCreator,
  proposeNegotiationRound,
  onboardCreator,
  requestCommercialEdit,
  addDeliverable,
  updateProductStatus,
  updateScriptStatus,
  updateContentStatus,
  addLiveLink,
  refreshDeliverableMetrics,
} from "@/lib/actions";

type Deliverable = {
  id: string;
  platform: string;
  title: string | null;
  status: string;
  productStatus: string | null;
  productEta: Date | null;
  scriptStatus: string | null;
  scriptDocUrl: string | null;
  contentStatus: string | null;
  liveLink: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  engagementRate: number | null;
};

type NegotiationRound = { id: string; roundNumber: number; proposedCost: number; proposedBy: string; note: string | null; createdAt: Date };

type Creator = {
  id: string;
  name: string;
  channelHandle: string;
  platformPrimary: string;
  followers: number | null;
  avgViews: number | null;
  internalCost: number | null;
  quotedCost: number | null;
  status: string;
  rejectionReason: string | null;
  commercialsLocked: boolean;
  negotiationRounds: NegotiationRound[];
  deliverables: Deliverable[];
};

type Remark = { id: string; body: string; authorRoleSnapshot: string; visibility: string; createdAt: Date; author: { name: string } };

const TABS = ["Shortlist & Review", "Deliverables & Production", "Communications", "Reports"] as const;

export default function CampaignWorkspace({
  campaignId,
  creators,
  remarks,
  role,
  canSeeCost,
  isClientView,
}: {
  campaignId: string;
  creators: Creator[];
  remarks: Remark[];
  role: Role;
  canSeeCost: boolean;
  isClientView: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Shortlist & Review");

  return (
    <div className="mt-6">
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t ? "border-b-2 border-brand text-brand" : "text-slate-500 hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="py-6">
        {tab === "Shortlist & Review" && (
          <ShortlistTab campaignId={campaignId} creators={creators} role={role} canSeeCost={canSeeCost} isClientView={isClientView} />
        )}
        {tab === "Deliverables & Production" && <DeliverablesTab creators={creators} isClientView={isClientView} />}
        {/* This component isn't rendered anywhere in the app today (the
        campaign detail page uses CreatorKanban instead) — mentionable is
        empty here since CampaignWorkspace never receives a team-member
        list from a caller. Fixing purely so `next build`'s type-check
        passes; no behavior change since nothing renders this component. */}
        {tab === "Communications" && <CommunicationsThread campaignId={campaignId} remarks={remarks} mentionable={[]} />}
        {tab === "Reports" && <ReportsTab creators={creators} canSeeCost={canSeeCost} />}
      </div>
    </div>
  );
}

// ---------- Shortlist & Client Review ----------

function ShortlistTab({
  campaignId,
  creators,
  role,
  canSeeCost,
  isClientView,
}: {
  campaignId: string;
  creators: Creator[];
  role: Role;
  canSeeCost: boolean;
  isClientView: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const active = creators.filter((c) => c.status !== "REJECTED").sort((a, b) => (a.status === "ONBOARDED" ? -1 : 1));
  const rejected = creators.filter((c) => c.status === "REJECTED");

  return (
    <div className="space-y-6">
      {!isClientView && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink">+ Add creator to shortlist</summary>
          <form action={async (fd) => { await addCreator(campaignId, fd); }} className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <input name="name" placeholder="Creator name" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="channelHandle" placeholder="@handle" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select name="platformPrimary" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input name="followers" type="number" placeholder="Followers" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="avgViews" type="number" placeholder="Avg views" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="internalCost" type="number" placeholder="Internal cost (₹)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="quotedCost" type="number" placeholder="Quoted cost (₹)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Add</button>
          </form>
        </details>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Creator</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Followers</th>
              <th className="px-4 py-3 font-medium">Avg views</th>
              {canSeeCost && <th className="px-4 py-3 font-medium">Internal cost</th>}
              <th className="px-4 py-3 font-medium">Quoted cost</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {active.map((c) => (
              <Fragment key={c.id}>
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-ink">{c.name}<div className="text-xs text-slate-400">{c.channelHandle}</div></td>
                  <td className="px-4 py-3 text-slate-600">{PLATFORM_LABELS[c.platformPrimary as keyof typeof PLATFORM_LABELS] ?? c.platformPrimary}</td>
                  <td className="px-4 py-3 text-slate-600">{c.followers?.toLocaleString("en-IN") ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.avgViews?.toLocaleString("en-IN") ?? "—"}</td>
                  {canSeeCost && <td className="px-4 py-3 text-slate-600">{c.internalCost ? `₹${c.internalCost.toLocaleString("en-IN")}` : "—"}</td>}
                  <td className="px-4 py-3 text-slate-600">{c.quotedCost ? `₹${c.quotedCost.toLocaleString("en-IN")}` : "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="text-xs font-medium text-brand hover:underline">
                      {expanded === c.id ? "Close" : "Review / Negotiate"}
                    </button>
                  </td>
                </tr>
                {expanded === c.id && (
                  <tr>
                    <td colSpan={canSeeCost ? 8 : 7} className="bg-slate-50 px-4 py-4">
                      <CreatorDetail creator={c} role={role} isClientView={isClientView} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {active.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No creators shortlisted yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {rejected.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-500">Rejected ({rejected.length})</summary>
          <div className="mt-3 space-y-2">
            {rejected.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span>{c.name} <span className="text-slate-400">{c.channelHandle}</span></span>
                <span className="text-xs text-slate-500">{c.rejectionReason}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CreatorDetail({ creator, role, isClientView }: { creator: Creator; role: Role; isClientView: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Negotiation history</p>
        <div className="space-y-2">
          {creator.negotiationRounds.length === 0 && <p className="text-xs text-slate-400">No negotiation rounds yet.</p>}
          {creator.negotiationRounds.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="font-medium">Round {r.roundNumber} — ₹{r.proposedCost.toLocaleString("en-IN")}</span>
                <span className="text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              {r.note && <p className="mt-1 text-slate-500">{r.note}</p>}
            </div>
          ))}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const cost = Number((form.elements.namedItem("cost") as HTMLInputElement).value);
            const note = (form.elements.namedItem("note") as HTMLInputElement).value;
            await proposeNegotiationRound(creator.id, cost, note);
            form.reset();
          }}
          className="mt-3 flex gap-2"
        >
          <input name="cost" type="number" placeholder="Propose cost (₹)" required className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
          <input name="note" placeholder="Note" className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
          <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">Propose</button>
        </form>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Actions</p>
        <div className="flex flex-wrap gap-2">
          {isClientView && creator.status !== "ONBOARDED" && (
            <>
              <button onClick={() => clientReviewCreator(creator.id, "CLIENT_LIKED")} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">Like</button>
              <button onClick={() => clientReviewCreator(creator.id, "CLIENT_NEGOTIATING")} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100">Negotiate</button>
              <button onClick={() => clientReviewCreator(creator.id, "CLIENT_REJECTED", "Not a fit")} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">Reject</button>
            </>
          )}
          {!isClientView && creator.status !== "ONBOARDED" && creator.status !== "REJECTED" && (
            <>
              <button onClick={() => onboardCreator(creator.id)} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Mark onboarded</button>
              <button onClick={() => rejectCreator(creator.id, "Rejected internally")} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">Reject</button>
            </>
          )}
          {!isClientView && creator.commercialsLocked && (
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-500">Commercials locked — edits need CM + Brand Solutions approval</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Deliverables & Production ----------

function DeliverablesTab({ creators, isClientView }: { creators: Creator[]; isClientView: boolean }) {
  const onboarded = creators.filter((c) => c.status === "ONBOARDED");
  return (
    <div className="space-y-6">
      {onboarded.map((c) => (
        <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">{c.name} <span className="font-normal text-slate-400">{c.channelHandle}</span></p>
            {!isClientView && (
              <form action={(fd) => addDeliverable(c.id, fd)} className="flex gap-2">
                <select name="platform" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                  {Object.entries(PLATFORM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input name="title" placeholder="Deliverable title" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                <button type="submit" className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium hover:bg-slate-200">+ Deliverable</button>
              </form>
            )}
          </div>
          <div className="space-y-3">
            {c.deliverables.map((d) => (
              <DeliverableCard key={d.id} deliverable={d} isClientView={isClientView} />
            ))}
            {c.deliverables.length === 0 && <p className="text-xs text-slate-400">No deliverables yet.</p>}
          </div>
        </div>
      ))}
      {onboarded.length === 0 && <p className="text-sm text-slate-400">No onboarded creators yet — production starts after onboarding.</p>}
    </div>
  );
}

function DeliverableCard({ deliverable: d, isClientView }: { deliverable: Deliverable; isClientView: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{PLATFORM_LABELS[d.platform as keyof typeof PLATFORM_LABELS] ?? d.platform} {d.title ? `— ${d.title}` : ""}</p>
        <StatusBadge status={d.status} />
      </div>

      {!isClientView && (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4 text-xs">
          <div>
            <p className="mb-1 font-medium text-slate-500">Product</p>
            <select
              defaultValue={d.productStatus ?? ""}
              onChange={(e) => updateProductStatus(d.id, e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1"
            >
              <option value="">—</option>
              <option value="ORDERED">Ordered</option>
              <option value="IN_TRANSIT">In transit</option>
              <option value="DELIVERED">Delivered</option>
            </select>
          </div>
          <div>
            <p className="mb-1 font-medium text-slate-500">Script</p>
            <select
              defaultValue={d.scriptStatus ?? ""}
              onChange={(e) => updateScriptStatus(d.id, e.target.value, d.scriptDocUrl ?? undefined)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1"
            >
              <option value="">—</option>
              <option value="SENT_FOR_APPROVAL">Sent for approval</option>
              <option value="FEEDBACK">Feedback marked</option>
              <option value="REVISED">Revised</option>
              <option value="APPROVED">Approved (freezes snapshot)</option>
            </select>
          </div>
          <div>
            <p className="mb-1 font-medium text-slate-500">Content</p>
            <select
              defaultValue={d.contentStatus ?? ""}
              onChange={(e) => updateContentStatus(d.id, e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1"
            >
              <option value="">—</option>
              <option value="IN_SHOOT">In shoot</option>
              <option value="INTERNAL_APPROVAL">Internal approval</option>
              <option value="EXTERNAL_APPROVAL">External approval (notifies client)</option>
              <option value="CHANGES_REQUESTED">Changes requested</option>
              <option value="APPROVED">Approved</option>
            </select>
          </div>
          <div>
            <p className="mb-1 font-medium text-slate-500">Live link</p>
            {d.liveLink ? (
              <a href={d.liveLink} target="_blank" className="text-brand hover:underline">Open ↗</a>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.currentTarget.elements.namedItem("link") as HTMLInputElement);
                  if (input.value) addLiveLink(d.id, input.value);
                }}
                className="flex gap-1"
              >
                <input name="link" placeholder="https://..." className="w-full rounded-lg border border-slate-300 px-2 py-1" />
                <button type="submit" className="rounded-lg bg-slate-100 px-2 py-1 font-medium hover:bg-slate-200">Go live</button>
              </form>
            )}
          </div>
        </div>
      )}

      {d.liveLink && (
        <div className="mt-3 flex items-center gap-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>Views: <b>{d.views?.toLocaleString("en-IN") ?? 0}</b></span>
          <span>Likes: <b>{d.likes?.toLocaleString("en-IN") ?? 0}</b></span>
          <span>Comments: <b>{d.comments?.toLocaleString("en-IN") ?? 0}</b></span>
          <span>Engagement: <b>{d.engagementRate ? `${d.engagementRate.toFixed(1)}%` : "—"}</b></span>
          {!isClientView && (
            <button
              onClick={() => {
                const views = Number(prompt("Views?", String(d.views ?? 0)) ?? d.views ?? 0);
                const likes = Number(prompt("Likes?", String(d.likes ?? 0)) ?? d.likes ?? 0);
                const comments = Number(prompt("Comments?", String(d.comments ?? 0)) ?? d.comments ?? 0);
                refreshDeliverableMetrics(d.id, { views, likes, comments });
              }}
              className="ml-auto text-brand hover:underline"
            >
              Refresh metrics (manual — automate in Phase 2)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Reports ----------

function ReportsTab({ creators, canSeeCost }: { creators: Creator[]; canSeeCost: boolean }) {
  const onboarded = creators.filter((c) => c.status === "ONBOARDED");
  const deliverables = onboarded.flatMap((c) => c.deliverables);
  const live = deliverables.filter((d) => d.liveLink);
  const totalViews = live.reduce((s, d) => s + (d.views ?? 0), 0);
  const totalSpendQuoted = onboarded.reduce((s, c) => s + (c.quotedCost ?? 0), 0);
  const blendedCpv = totalViews > 0 ? totalSpendQuoted / totalViews : 0;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="stat-card"><p className="text-xs text-slate-500">Onboarded creators</p><p className="mt-1 text-xl font-semibold">{onboarded.length}</p></div>
      <div className="stat-card"><p className="text-xs text-slate-500">Live posts</p><p className="mt-1 text-xl font-semibold">{live.length}</p></div>
      <div className="stat-card"><p className="text-xs text-slate-500">Total views</p><p className="mt-1 text-xl font-semibold">{totalViews.toLocaleString("en-IN")}</p></div>
      <div className="stat-card"><p className="text-xs text-slate-500">Blended CPV</p><p className="mt-1 text-xl font-semibold">₹{blendedCpv.toFixed(2)}</p></div>
      {canSeeCost && (
        <div className="stat-card col-span-2"><p className="text-xs text-slate-500">Total quoted spend</p><p className="mt-1 text-xl font-semibold">₹{totalSpendQuoted.toLocaleString("en-IN")}</p></div>
      )}
      <p className="col-span-full mt-2 text-xs text-slate-400">
        Blended CPV is the honest headline number because cost is stored once at creator level, not invented per deliverable (brief slide 19).
        Full spotlight / spend-band / sentiment reporting is Phase 3 — see README.
      </p>
    </div>
  );
}
