"use client";

import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/constants";
import {
  PLATFORM_LABELS,
  creatorKanbanColumn,
  SHORTLIST_DELIVERABLE_TYPES,
  SHORTLIST_DELIVERABLE_LABELS,
  SHORTLIST_DELIVERABLE_SOCIAL,
  SHORTLIST_TO_EXECUTION_PLATFORM,
  CLIENT_INTENT_LABELS,
  type ShortlistDeliverableType,
} from "@/lib/constants";
import StatusBadge from "@/components/StatusBadge";
import CampaignReport from "@/components/campaign/CampaignReport";
import {
  addCreator,
  addDeliverable,
  updateDeliverableTitle,
  updateProductStatus,
  updateScriptStatus,
  updateContentStatus,
  deleteDeliverable,
  addLiveLink,
  lookupInstagramProfileAction,
  lookupYoutubeChannelAction,
  refreshCreatorSocialStats,
  updateCreatorShortlist,
  addShortlistDeliverable,
  deleteShortlistDeliverable,
  setCreatorClientDecision,
  assignCreatorPOC,
  updateCreatorDeadline,
  requestFinalCostEdit,
  rejectCreator,
} from "@/lib/actions";
import {
  UserPlus,
  Users,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  ExternalLink,
  RefreshCw,
  X,
  Plus,
  Tv,
  Camera,
  Video,
  Wand2,
  Loader2,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Pencil,
  History,
  AlertTriangle,
  Clock,
  Trash2,
} from "lucide-react";

export type Deliverable = {
  id: string;
  platform: string;
  title: string | null;
  status: string;
  productStatus: string | null;
  scriptStatus: string | null;
  scriptDocUrl: string | null;
  contentStatus: string | null;
  liveLink: string | null;
  liveDate: string | Date | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares?: number | null;
  engagementRate: number | null;
  lastTrackedAt?: string | Date | null;
};

export type ActivityLogEntry = {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: string | null;
  createdAt: string | Date;
};

type NegotiationRound = { id: string; roundNumber: number; proposedCost: number; proposedBy: string; note: string | null; createdAt: Date };

// Just a tag: which deliverable type a creator is being pitched for. The
// actual numbers/costs/client decision live once on Creator (shared, not
// per deliverable) — see the fields added below.
type ShortlistDeliverableRow = {
  id: string;
  deliverableType: string;
  executionDeliverableId: string | null;
};

// internalCost/insightsLinks etc. are optional because the client-facing
// serializer strips internalCost, and older records may predate these fields.
export type Creator = {
  id: string;
  name: string;
  channelHandle: string;
  profileUrl: string | null;
  youtubeUrl: string | null;
  platformPrimary: string;
  followers: number | null;
  avgViews: number | null;
  engagementRate: number | null;
  youtubeSubscribers?: number | null;
  youtubeLongMedianViews?: number | null;
  youtubeLongMedianERPercent?: number | null;
  youtubeShortsMedianViews?: number | null;
  youtubeShortsMedianERPercent?: number | null;
  internalCost?: number | null;
  quotedCost: number | null;
  status: string;
  rejectionReason: string | null;
  commercialsLocked: boolean;
  insightsLinks: string | null;
  clientIntent: string | null;
  clientCounterCost: number | null;
  clientRemark: string | null;
  finalQuotedCost: number | null;
  clientFinalIntent: string | null;
  rightsOfUsage: boolean;
  usageDurationDays: number | null;
  onboardedAt: string | Date | null;
  goLiveDeadline: string | Date | null;
  pocUserId: string | null;
  poc: { id: string; name: string } | null;
  negotiationRounds: NegotiationRound[];
  deliverables: Deliverable[];
  shortlistDeliverables: ShortlistDeliverableRow[];
};

export default function CreatorKanban({
  campaignId,
  campaignName,
  campaignBrand,
  campaignStartDate,
  creators,
  role,
  canSeeCost,
  isClientView,
  internalUsers,
  activityLogs,
}: {
  campaignId: string;
  campaignName: string;
  campaignBrand: string;
  campaignStartDate: string | Date | null;
  creators: Creator[];
  role: Role;
  canSeeCost: boolean;
  isClientView: boolean;
  internalUsers: { id: string; name: string; role: string }[];
  activityLogs: ActivityLogEntry[];
}) {
  const [addingCreator, setAddingCreator] = useState(false);
  const [tab, setTab] = useState<"SHORTLIST" | "ONBOARDING" | "REPORT">("SHORTLIST");

  // A creator removed via the trash icon below gets status REJECTED
  // (see rejectCreator) — kept in the DB for history, just dropped off
  // this board. CLIENT_REJECTED is left visible since the team may still
  // need to act on/negotiate a client's rejection.
  const shortlist = creators.filter((c) => creatorKanbanColumn(c.status) === "SHORTLIST" && c.status !== "REJECTED");
  const onboarding = creators.filter((c) => c.status === "ONBOARDED");

  // Shortlisting Stage sheet tab's own summary strip — only the four
  // cleanly-computable fields (Shared/Shortlisted/Average Quoted Price/
  // Onboarded from the list). "Client Intent Pending on" and "TBM's Team
  // input pending on" are left out until their exact rule is defined.
  const creatorsShared = shortlist.length;
  const creatorsShortlisted = shortlist.filter((c) => c.status === "CLIENT_LIKED" || c.status === "CLIENT_NEGOTIATING").length;
  const quotedPrices = shortlist.map((c) => c.quotedCost).filter((n): n is number => n != null);
  const averageQuotedPrice = quotedPrices.length > 0 ? quotedPrices.reduce((s, n) => s + n, 0) / quotedPrices.length : null;
  const onboardedFromList = onboarding.length;

  return (
    <div className="mt-8 space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-0.5">
        <TabButton active={tab === "SHORTLIST"} onClick={() => setTab("SHORTLIST")} label="Shortlist" count={shortlist.length} />
        <TabButton active={tab === "ONBOARDING"} onClick={() => setTab("ONBOARDING")} label="Onboarding" count={onboarding.length} />
        <TabButton active={tab === "REPORT"} onClick={() => setTab("REPORT")} label="Campaign Report" />
      </div>

      <div className="py-2">
        {tab === "SHORTLIST" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-4">
              {[
                { label: "Creators Shortlisting Shared", value: String(creatorsShared) },
                { label: "Creators Shortlisted", value: String(creatorsShortlisted) },
                { label: "Average Quoted Price", value: averageQuotedPrice != null ? `₹${Math.round(averageQuotedPrice).toLocaleString("en-IN")}` : "—" },
                { label: "Onboarded from the list", value: String(onboardedFromList) },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{s.label}</p>
                  <p className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">{s.value}</p>
                </div>
              ))}
            </div>
            {!isClientView && (
              <div>
                {!addingCreator ? (
                  <button
                    onClick={() => setAddingCreator(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-xs transition-all hover:border-indigo-500 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>+ Add Influencer to Shortlist</span>
                  </button>
                ) : (
                  <AddCreatorForm campaignId={campaignId} onDone={() => setAddingCreator(false)} />
                )}
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
              <div className="max-h-[70vh] overflow-auto scrollbar-x-hidden">
                <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="sticky left-0 top-0 z-40 w-[200px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Name</th>
                      <th className="sticky left-[200px] top-0 z-40 w-[230px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Socials</th>
                      <th className="sticky left-[430px] top-0 z-40 w-[260px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Deliverables</th>
                      <th className="sticky top-0 z-30 w-[220px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Rights of Usage</th>
                      <th className="sticky top-0 z-30 w-[160px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Audience Size</th>
                      <th className="sticky top-0 z-30 w-[180px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Median Views</th>
                      <th className="sticky top-0 z-30 w-[150px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Median ER%</th>
                      <th className="sticky top-0 z-30 w-[110px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Insights</th>
                      {canSeeCost && <th className="sticky top-0 z-30 w-[150px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Internal Cost</th>}
                      <th className="sticky top-0 z-30 w-[150px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Quoted Cost</th>
                      <th className="sticky top-0 z-30 w-[170px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Client&apos;s Intent</th>
                      <th className="sticky top-0 z-30 w-[200px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Client&apos;s Counter Cost</th>
                      <th className="sticky top-0 z-30 w-[220px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Client&apos;s Remark</th>
                      <th className="sticky top-0 z-30 w-[150px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Final Quoted Cost</th>
                      <th className="sticky top-0 z-30 w-[200px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Client&apos;s Final Intent</th>
                      {isClientView ? (
                        <th className="sticky top-0 z-30 w-6 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" aria-hidden />
                      ) : (
                        <th className="sticky top-0 z-30 w-[70px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Remove</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
                    {shortlist.map((c) => (
                      <ShortlistCreatorRow key={c.id} creator={c} canSeeCost={canSeeCost} isClientView={isClientView} role={role} />
                    ))}
                    {shortlist.length === 0 && (
                      <tr>
                        <td colSpan={canSeeCost ? 16 : 15} className="px-5 py-12 text-center text-slate-400 dark:text-slate-500">
                          <Users className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                          <p className="text-sm font-medium">No influencers shortlisted yet.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "ONBOARDING" && (
          <div className="space-y-4">
            <OnboardingSummaryStrip creators={onboarding} activityLogs={activityLogs} />
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
            <div className="max-h-[70vh] overflow-auto scrollbar-x-hidden">
              <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="sticky left-0 top-0 z-40 w-[200px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Name</th>
                    <th className="sticky left-[200px] top-0 z-40 w-[230px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Socials</th>
                    <th className="sticky left-[430px] top-0 z-40 w-[260px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Deliverables</th>
                    <th className="sticky top-0 z-30 w-[220px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Rights of Usage</th>
                    <th className="sticky top-0 z-30 w-[160px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Audience Size</th>
                    <th className="sticky top-0 z-30 w-[180px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Median Views</th>
                    <th className="sticky top-0 z-30 w-[150px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Median ER%</th>
                    <th className="sticky top-0 z-30 w-[110px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Insights</th>
                    <th className="sticky top-0 z-30 w-[160px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Final Quoted Cost</th>
                    <th className="sticky top-0 z-30 w-[160px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">POC</th>
                    <th className="sticky top-0 z-30 w-[160px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Product Status</th>
                    <th className="sticky top-0 z-30 w-[170px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Script Status</th>
                    <th className="sticky top-0 z-30 w-[140px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Script Link</th>
                    <th className="sticky top-0 z-30 w-[170px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Video Status</th>
                    <th className="sticky top-0 z-30 w-[140px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Live Video Link</th>
                    <th className="sticky top-0 z-30 w-[170px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Deadline</th>
                    <th className="sticky top-0 z-30 w-[150px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Time Remaining</th>
                    <th className="sticky top-0 z-30 w-[190px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Last Action</th>
                    <th className="sticky top-0 z-30 w-[260px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800">Flag / Alert</th>
                    <th className="sticky top-0 z-30 w-6 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" aria-hidden />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
                  {onboarding.map((c) => (
                    <OnboardingCreatorRow
                      key={c.id}
                      creator={c}
                      isClientView={isClientView}
                      internalUsers={internalUsers}
                      activityLogs={activityLogs}
                      canApproveCost={role === "CXO" || role === "CAMPAIGN_MANAGER" || role === "BRAND_SOLUTIONS"}
                      canSetCost={role === "CXO" || role === "BRAND_SOLUTIONS" || role === "CAMPAIGN_MANAGER" || role === "IR_MANAGER"}
                    />
                  ))}
                  {onboarding.length === 0 && (
                    <tr>
                      <td colSpan={19} className="px-5 py-12 text-center text-slate-400 dark:text-slate-500">
                        <Users className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                        <p className="text-sm font-medium">No influencers onboarded yet.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </div>
          </div>
        )}

        {tab === "REPORT" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Auto-updating. Every number is pulled from what's tracked on the Onboarding page and refreshes as soon as that data changes.
              </p>
              <a
                href={`/api/campaigns/${campaignId}/report`}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download CSV</span>
              </a>
            </div>
            <CampaignReport
              campaignName={campaignName}
              campaignBrand={campaignBrand}
              campaignStartDate={campaignStartDate}
              onboarding={onboarding}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Small labeled number input used inside the Add Influencer dialog — keeps
// every stat field (Audience Size / Median Views / Median ER% / costs)
// visually consistent between the Instagram section and the YouTube dialog.
function NumField({
  name,
  label,
  step,
  prefix,
  onValueChange,
}: {
  name: string;
  label: string;
  step?: string;
  prefix?: string;
  onValueChange?: (raw: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 dark:text-slate-500">{prefix}</span>}
        <input
          name={name}
          type="number"
          step={step}
          onChange={onValueChange ? (e) => onValueChange(e.target.value) : undefined}
          className={`w-full rounded-xl border border-slate-200 py-2 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 ${prefix ? "pl-6 pr-3" : "px-3"}`}
        />
      </div>
    </label>
  );
}

// Add Influencer dialog. Instagram URL auto-fills Audience Size / Median
// Views / Median ER% from the Instagram Graph API (Business Discovery) right
// in this dialog — budget given and internal cost are deal terms, not
// profile data, so those always stay manual. YouTube channel details live in
// a separate nested dialog opened via "+ Add YouTube Channel", since a
// creator may only have one of the two platforms.
function AddCreatorForm({ campaignId, onDone }: { campaignId: string; onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const lastFetchedUrl = useRef<string>("");

  const [ytFetching, setYtFetching] = useState(false);
  const [ytFetchMsg, setYtFetchMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const lastFetchedYoutubeUrl = useRef<string>("");

  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [youtubeAdded, setYoutubeAdded] = useState(false);

  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [instagramAdded, setInstagramAdded] = useState(false);

  async function handleAutoFill(rawUrl: string) {
    const url = rawUrl.trim();
    const form = formRef.current;
    if (!form || !url || url === lastFetchedUrl.current) return;
    lastFetchedUrl.current = url;

    setFetching(true);
    setFetchMsg(null);
    const result = await lookupInstagramProfileAction(url);
    setFetching(false);

    if (!result.ok) {
      setFetchMsg({ type: "error", text: result.error });
      return;
    }

    const { data } = result;
    (form.elements.namedItem("followers") as HTMLInputElement).value = String(data.followers);
    if (data.engagementRate !== null && data.engagementRate !== undefined) {
      (form.elements.namedItem("engagementRate") as HTMLInputElement).value = String(data.engagementRate);
    }
    if (data.avgViews !== null && data.avgViews !== undefined) {
      (form.elements.namedItem("avgViews") as HTMLInputElement).value = String(data.avgViews);
    }
    const handleInput = form.elements.namedItem("channelHandle") as HTMLInputElement;
    if (!handleInput.value.trim()) handleInput.value = `@${data.username}`;
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    if (!nameInput.value.trim()) nameInput.value = data.username;
    setInstagramAdded(true);

    const parts = [`${data.followers.toLocaleString("en-IN")} followers`];
    if (data.engagementRate !== null && data.engagementRate !== undefined) parts.push(`${data.engagementRate}% engagement`);
    if (data.avgViews !== null && data.avgViews !== undefined) parts.push(`${data.avgViews.toLocaleString("en-IN")} avg views`);
    const capturedLabel = data.capturedAt ? ` (captured ${new Date(data.capturedAt).toLocaleDateString("en-IN")})` : "";

    setFetchMsg({
      type: "success",
      text: `Pulled @${data.username} from your database: ${parts.join(", ")}${capturedLabel}.`,
    });
  }

  async function handleYoutubeAutoFill(rawUrl: string) {
    const url = rawUrl.trim();
    const form = formRef.current;
    if (!url) return;
    if (url === lastFetchedYoutubeUrl.current) return;
    lastFetchedYoutubeUrl.current = url;
    if (!form) return;

    setYtFetching(true);
    setYtFetchMsg(null);
    const result = await lookupYoutubeChannelAction(url);
    setYtFetching(false);

    if (!result.ok) {
      setYtFetchMsg({ type: "error", text: result.error });
      return;
    }

    const { data } = result;
    const setHidden = (name: string, value: number | null | undefined) => {
      if (value === null || value === undefined) return;
      (form.elements.namedItem(name) as HTMLInputElement).value = String(value);
    };
    setHidden("youtubeSubscribers", data.subscribers);
    setHidden("youtubeLongMedianViews", data.longMedianViews);
    setHidden("youtubeLongMedianERPercent", data.longMedianERPercent);
    setHidden("youtubeShortsMedianViews", data.shortsMedianViews);
    setHidden("youtubeShortsMedianERPercent", data.shortsMedianERPercent);
    setYoutubeAdded(true);

    const parts: string[] = [];
    if (data.subscribers !== null && data.subscribers !== undefined) parts.push(`${data.subscribers.toLocaleString("en-IN")} subscribers`);
    if (data.longMedianViews !== null && data.longMedianViews !== undefined) parts.push(`${data.longMedianViews.toLocaleString("en-IN")} long-form median views`);
    if (data.shortsMedianViews !== null && data.shortsMedianViews !== undefined) parts.push(`${data.shortsMedianViews.toLocaleString("en-IN")} Shorts median views`);

    setYtFetchMsg({
      type: "success",
      text: parts.length
        ? `Pulled from YouTube${(result as { stale?: boolean }).stale ? " (cached)" : ""}: ${parts.join(", ")}.`
        : "Fetched the channel, but it has no recent uploads to estimate median views/ER from yet.",
    });
  }

  function clearInstagramFields() {
    const form = formRef.current;
    if (form) {
      ["profileUrl", "followers", "avgViews", "engagementRate"].forEach((n) => {
        const el = form.elements.namedItem(n) as HTMLInputElement | null;
        if (el) el.value = "";
      });
    }
    lastFetchedUrl.current = "";
    setFetchMsg(null);
    setInstagramAdded(false);
  }

  function clearYoutubeFields() {
    const form = formRef.current;
    if (form) {
      ["youtubeUrl", "youtubeSubscribers", "youtubeLongMedianViews", "youtubeLongMedianERPercent", "youtubeShortsMedianViews", "youtubeShortsMedianERPercent"].forEach((n) => {
        const el = form.elements.namedItem(n) as HTMLInputElement | null;
        if (el) el.value = "";
      });
    }
    lastFetchedYoutubeUrl.current = "";
    setYtFetchMsg(null);
    setYoutubeAdded(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 dark:bg-black/60" onClick={onDone}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Add Influencer to Shortlist</h3>
          <button type="button" onClick={onDone} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          ref={formRef}
          action={async (fd) => {
            if (!fd.get("platformPrimary")) {
              const pitchedTypes = fd.getAll("deliverables") as ShortlistDeliverableType[];
              const primaryType = pitchedTypes[0];
              fd.set("platformPrimary", primaryType ? SHORTLIST_TO_EXECUTION_PLATFORM[primaryType] : "INSTAGRAM_REEL");
            }
            await addCreator(campaignId, fd);
            onDone();
          }}
          className="mt-4 space-y-5"
        >
          <div className="grid grid-cols-2 gap-3">
            <input name="name" placeholder="Creator Name" required className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" />
            <input name="channelHandle" placeholder="@handle" required className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" />
          </div>

          {/* Budget given (quotedCost) removed from this form on purpose —
              that's the cost the Campaign Manager quotes to the client, so
              it's only ever set from the shortlist table, and only by a
              Campaign Manager (see updateCreatorShortlist in actions.ts). */}
          <NumField name="internalCost" label="Internal cost" prefix="₹" />

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Deliverables to pitch</p>
            <div className="flex flex-wrap gap-2">
              {SHORTLIST_DELIVERABLE_TYPES.map((type) => (
                <label key={type} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <input type="checkbox" name="deliverables" value={type} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600" />
                  <span>{SHORTLIST_DELIVERABLE_LABELS[type]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-pink-600 dark:text-pink-400">
                <Camera className="h-3.5 w-3.5" />
                <span>Instagram</span>
              </p>
              {instagramAdded ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Profile added</span>
                  </span>
                  <button type="button" onClick={() => setShowInstagramModal(true)} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Edit</button>
                  <button type="button" onClick={clearInstagramFields} className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400">Remove</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowInstagramModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Instagram Profile</span>
                </button>
              )}
            </div>
          </div>

          {/* Nested Instagram dialog — same collapsed/expand-into-modal
              pattern as YouTube below. Fields stay mounted (hidden via CSS,
              never unmounted) so values survive closing/reopening and still
              submit as part of the outer form. */}
          <div
            className={`fixed inset-0 z-[60] items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 dark:bg-black/60 ${showInstagramModal ? "flex" : "hidden"}`}
            onClick={() => setShowInstagramModal(false)}
          >
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                  <Camera className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                  <span>Instagram Profile</span>
                </h4>
                <button type="button" onClick={() => setShowInstagramModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <input
                    name="profileUrl"
                    placeholder="Paste Instagram profile URL"
                    onChange={(e) => { if (e.target.value.trim()) setInstagramAdded(true); }}
                    onBlur={(e) => handleAutoFill(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAutoFill((e.target as HTMLInputElement).value);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-8 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
                  />
                  {fetching && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-indigo-500" />}
                  {!fetching && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2" title="Auto-fills on blur from Instagram">
                      <Wand2 className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <NumField name="followers" label="Audience Size" onValueChange={(v) => v.trim() && setInstagramAdded(true)} />
                  <NumField name="avgViews" label="Median Views" onValueChange={(v) => v.trim() && setInstagramAdded(true)} />
                  <NumField name="engagementRate" label="Median ER%" step="0.01" onValueChange={(v) => v.trim() && setInstagramAdded(true)} />
                </div>
                {fetchMsg && (
                  <p className={`text-xs ${fetchMsg.type === "error" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {fetchMsg.text}
                  </p>
                )}
              </div>
              <div className="mt-5 flex justify-end">
                <button type="button" onClick={() => setShowInstagramModal(false)} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700">Done</button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                <Tv className="h-3.5 w-3.5" />
                <span>YouTube</span>
              </p>
              {youtubeAdded ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Channel added</span>
                  </span>
                  <button type="button" onClick={() => setShowYoutubeModal(true)} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Edit</button>
                  <button type="button" onClick={clearYoutubeFields} className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400">Remove</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowYoutubeModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add YouTube Channel</span>
                </button>
              )}
            </div>
          </div>

          {/* Nested YouTube dialog. Its fields stay mounted (just hidden via
              CSS, never unmounted) so values survive closing/reopening and
              still submit as part of the outer form. */}
          <div
            className={`fixed inset-0 z-[60] items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 dark:bg-black/60 ${showYoutubeModal ? "flex" : "hidden"}`}
            onClick={() => setShowYoutubeModal(false)}
          >
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                  <Tv className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  <span>YouTube Channel</span>
                </h4>
                <button type="button" onClick={() => setShowYoutubeModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <input
                    name="youtubeUrl"
                    placeholder="Paste YouTube channel URL"
                    onChange={(e) => { if (e.target.value.trim()) setYoutubeAdded(true); }}
                    onBlur={(e) => handleYoutubeAutoFill(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleYoutubeAutoFill((e.target as HTMLInputElement).value);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-8 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
                  />
                  {ytFetching && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-indigo-500" />}
                  {!ytFetching && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2" title="Auto-fills on blur from YouTube">
                      <Wand2 className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <NumField name="youtubeSubscribers" label="Audience Size" onValueChange={(v) => v.trim() && setYoutubeAdded(true)} />
                  <NumField name="youtubeLongMedianViews" label="Median Views (Long)" onValueChange={(v) => v.trim() && setYoutubeAdded(true)} />
                  <NumField name="youtubeLongMedianERPercent" label="Median ER% (Long)" step="0.01" onValueChange={(v) => v.trim() && setYoutubeAdded(true)} />
                  <NumField name="youtubeShortsMedianViews" label="Median Views (Shorts)" onValueChange={(v) => v.trim() && setYoutubeAdded(true)} />
                  <NumField name="youtubeShortsMedianERPercent" label="Median ER% (Shorts)" step="0.01" onValueChange={(v) => v.trim() && setYoutubeAdded(true)} />
                </div>
                {ytFetchMsg && (
                  <p className={`text-xs ${ytFetchMsg.type === "error" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {ytFetchMsg.text}
                  </p>
                )}
              </div>
              <div className="mt-5 flex justify-end">
                <button type="button" onClick={() => setShowYoutubeModal(false)} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700">Done</button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700">Save Influencer</button>
            <button type="button" onClick={onDone} className="rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-3 text-xs font-bold transition-all ${
        active ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${active ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
          {count}
        </span>
      )}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-indigo-600" />}
    </button>
  );
}

// Short label for stacking multiple deliverables' controls in one cell
// (e.g. Production/Scripting columns) — mirrors the IG/YT labels already
// used for Audience Size / Median Views in the Shortlist table.
function platformShortLabel(platform: string): string {
  if (platform === "YOUTUBE_SHORTS") return "YTS";
  if (platform.startsWith("YOUTUBE")) return "YT";
  if (platform.startsWith("INSTAGRAM")) return "IG";
  return platform.slice(0, 3).toUpperCase();
}

// When href is given, the badge is a clickable link out to the creator's
// actual profile (Instagram/YouTube) instead of a static label.
function PlatformBadge({ platform, href }: { platform: string; href?: string | null }) {
  const p = platform.toUpperCase();
  const Wrapper = href ? "a" : "span";
  const linkProps = href ? { href, target: "_blank", rel: "noreferrer" } : {};

  if (p.includes("YOUTUBE")) {
    return (
      <Wrapper {...linkProps} className={`inline-flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-200/80 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:border-rose-800/80 dark:text-rose-300 ${href ? "hover:border-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 cursor-pointer" : ""}`}>
        <Tv className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
        <span>YouTube</span>
      </Wrapper>
    );
  }
  if (p.includes("INSTAGRAM")) {
    return (
      <Wrapper {...linkProps} className={`inline-flex items-center gap-1.5 rounded-lg bg-pink-50 border border-pink-200/80 px-2.5 py-1 text-xs font-bold text-pink-700 dark:bg-pink-950/50 dark:border-pink-800/80 dark:text-pink-300 ${href ? "hover:border-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/60 cursor-pointer" : ""}`}>
        <Camera className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400" />
        <span>Instagram</span>
      </Wrapper>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
      <Video className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
      <span>{PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS] ?? platform}</span>
    </span>
  );
}

// Renders every deliverable pitch row for one creator, one <tr> per
// ShortlistDeliverable (or a single "no deliverables yet" row for creators
// added before this feature existed, so nothing silently disappears).
// One row per creator. Deliverables (Reel/YT Shorts/etc.) render as removable
// tags in a single cell rather than separate rows — Audience Size/Median
// Views/Median ER%/costs/client decision are one shared set of numbers per
// creator, not broken out per deliverable type.
function ShortlistCreatorRow({ creator, canSeeCost, isClientView, role }: { creator: Creator; canSeeCost: boolean; isClientView: boolean; role: Role }) {
  const [showInsights, setShowInsights] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  async function handleRefreshStats() {
    setRefreshing(true);
    setRefreshMsg(null);
    const result = await refreshCreatorSocialStats(creator.id);
    setRefreshing(false);
    if (!result.changed) {
      setRefreshMsg(result.igError || result.ytError ? (result.igError ?? result.ytError ?? "No fresher data found.") : "Already up to date.");
      return;
    }
    const summary = result.changes
      .map((c) => {
        const delta = (c.after ?? 0) - (c.before ?? 0);
        const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
        return `${c.field}: ${(c.before ?? 0).toLocaleString("en-IN")} ${arrow} ${(c.after ?? 0).toLocaleString("en-IN")}`;
      })
      .join(", ");
    setRefreshMsg(summary);
  }

  // Only show the social that's actually relevant — i.e. the creator has at
  // least one tagged deliverable on that platform. A creator pitched only
  // for YT Shorts shouldn't show their Instagram handle here, even though
  // channelHandle is always stored.
  const hasInstagramDeliverable = creator.shortlistDeliverables.some(
    (d) => SHORTLIST_DELIVERABLE_SOCIAL[d.deliverableType as keyof typeof SHORTLIST_DELIVERABLE_SOCIAL] === "INSTAGRAM"
  );
  // YouTube long-form (Dedicated/Integrated/Conceptual) and Shorts have
  // different median views/ER — tracked separately — but share the same
  // subscriber count, so they're split for that purpose only.
  const hasYoutubeLongDeliverable = creator.shortlistDeliverables.some((d) => d.deliverableType === "YT_DEDICATED" || d.deliverableType === "YT_INTEGRATED" || d.deliverableType === "YT_CONCEPTUAL");
  const hasYoutubeShortsDeliverable = creator.shortlistDeliverables.some((d) => d.deliverableType === "YT_SHORTS");
  const hasYoutubeDeliverable = hasYoutubeLongDeliverable || hasYoutubeShortsDeliverable;
  // No deliverables tagged yet — fall back to showing whatever's filled in,
  // so the column isn't empty while someone's still setting the creator up.
  const noDeliverablesYet = creator.shortlistDeliverables.length === 0;
  const showInstagram = noDeliverablesYet ? Boolean(creator.channelHandle) : hasInstagramDeliverable;
  const showYoutube = noDeliverablesYet ? Boolean(creator.youtubeUrl) : hasYoutubeDeliverable;
  const showYoutubeLong = noDeliverablesYet ? Boolean(creator.youtubeUrl) : hasYoutubeLongDeliverable;
  const showYoutubeShorts = noDeliverablesYet ? false : hasYoutubeShortsDeliverable;

  // Usage Expiry Date = Content Live Date + Usage Duration. Content Live
  // Date is the earliest go-live date across this creator's tracked
  // deliverables (there's one shared Rights of Usage per creator, not per
  // deliverable) — null until at least one deliverable has actually gone
  // live, since there's nothing to count the usage window from yet.
  const liveDates = creator.deliverables.map((d) => d.liveDate).filter((d): d is string | Date => Boolean(d)).map((d) => new Date(d));
  const earliestLiveDate = liveDates.length ? new Date(Math.min(...liveDates.map((d) => d.getTime()))) : null;
  let usageExpiry: Date | null = null;
  if (creator.rightsOfUsage && creator.usageDurationDays && earliestLiveDate) {
    usageExpiry = new Date(earliestLiveDate);
    usageExpiry.setDate(usageExpiry.getDate() + creator.usageDurationDays);
  }
  const usageExpired = usageExpiry ? usageExpiry.getTime() < Date.now() : false;

  let links: string[] = [];
  try {
    links = creator.insightsLinks ? JSON.parse(creator.insightsLinks) : [];
  } catch {
    links = [];
  }

  return (
    <tr className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
      <td className="sticky left-0 z-10 w-[200px] min-w-[200px] max-w-[200px] whitespace-nowrap overflow-hidden text-ellipsis border-b border-slate-100 bg-white px-5 py-4 font-bold text-slate-900 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:group-hover:bg-slate-800">
        <span className="block truncate">{creator.name}</span>
        <div className="truncate text-xs text-slate-400 dark:text-slate-500 font-medium">{creator.channelHandle}</div>
      </td>
      <td className="sticky left-[200px] z-10 w-[230px] min-w-[230px] max-w-[230px] border-b border-slate-100 bg-white px-5 py-4 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
        <div className="flex flex-col gap-1">
          {/* Same two-line format for every creator: top line is "@handle"
              linking to the Instagram profile, bottom line is "YouTube"
              linking to the YouTube channel — like mrbeast's row. For a
              YouTube-primary creator whose Instagram was detected from their
              YT description (a different handle than channelHandle), the
              top line shows that real Instagram handle instead of
              channelHandle, so the displayed @text always matches where it
              actually links. */}
          {(() => {
            const isYoutubePrimary = creator.platformPrimary === "YOUTUBE_LONG" || creator.platformPrimary === "YOUTUBE_SHORTS";
            const instagramHandleFromUrl = creator.profileUrl?.match(/instagram\.com\/([^/?#]+)/i)?.[1] ?? null;
            const topLineHandle = isYoutubePrimary ? (instagramHandleFromUrl ? `@${instagramHandleFromUrl}` : null) : creator.channelHandle;
            return (
              <>
                {topLineHandle &&
                  (creator.profileUrl ? (
                    <a href={creator.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                      <span>{topLineHandle}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{topLineHandle}</span>
                  ))}
                {isYoutubePrimary && !instagramHandleFromUrl && (
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{creator.channelHandle}</span>
                )}
                {showYoutube &&
                  (creator.youtubeUrl ? (
                    <a href={creator.youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                      <span>YouTube</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">YouTube (no link yet)</span>
                  ))}
              </>
            );
          })()}
          {!creator.channelHandle && !showYoutube && <span className="text-xs text-slate-400 dark:text-slate-500">—</span>}
          {!isClientView && (
            <button
              type="button"
              onClick={handleRefreshStats}
              disabled={refreshing}
              title="Pull the latest captured Followers/Subscribers/etc. into this row"
              className="inline-flex w-fit items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-600 disabled:opacity-50 dark:text-slate-500 dark:hover:text-indigo-400"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Refreshing…" : "Refresh stats"}</span>
            </button>
          )}
          {refreshMsg && <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{refreshMsg}</span>}
        </div>
      </td>
      <td className="sticky left-[430px] z-10 w-[260px] min-w-[260px] max-w-[260px] border-b border-slate-100 bg-white px-5 py-4 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {creator.shortlistDeliverables.map((line) => (
            <span key={line.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
              {SHORTLIST_DELIVERABLE_LABELS[line.deliverableType as keyof typeof SHORTLIST_DELIVERABLE_LABELS] ?? line.deliverableType}
              {!isClientView && (
                <button
                  onClick={() => {
                    if (confirm("Remove this deliverable?")) deleteShortlistDeliverable(line.id);
                  }}
                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {creator.shortlistDeliverables.length === 0 && <span className="text-xs text-slate-400 dark:text-slate-500">—</span>}
          {!isClientView && (
            <select
              defaultValue=""
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                addShortlistDeliverable(creator.id, value as (typeof SHORTLIST_DELIVERABLE_TYPES)[number]);
                e.target.value = "";
              }}
              className="rounded-lg border border-dashed border-slate-300 bg-white px-1.5 py-1 text-xs font-semibold text-indigo-600 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-indigo-400"
            >
              <option value="">+ Add</option>
              {SHORTLIST_DELIVERABLE_TYPES.map((type) => (
                <option key={type} value={type}>{SHORTLIST_DELIVERABLE_LABELS[type]}</option>
              ))}
            </select>
          )}
        </div>
      </td>
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {isClientView ? (
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            <div>{creator.rightsOfUsage ? `Yes${creator.usageDurationDays ? ` (${creator.usageDurationDays}d)` : ""}` : "No"}</div>
            {creator.rightsOfUsage && creator.usageDurationDays && (
              <div className={`mt-0.5 text-[11px] font-medium ${usageExpired ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"}`}>
                {usageExpiry
                  ? `${usageExpired ? "Expired" : "Expires"} ${usageExpiry.toLocaleDateString("en-IN")}`
                  : "Expiry pending go-live"}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-1.5">
              <select
                defaultValue={creator.rightsOfUsage ? "YES" : "NO"}
                onChange={(e) => updateCreatorShortlist(creator.id, { rightsOfUsage: e.target.value === "YES" })}
                className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="NO">No</option>
                <option value="YES">Yes</option>
              </select>
              {creator.rightsOfUsage && (
                <input
                  type="number"
                  defaultValue={creator.usageDurationDays ?? ""}
                  placeholder="days"
                  onBlur={(e) => updateCreatorShortlist(creator.id, { usageDurationDays: e.target.value === "" ? null : Number(e.target.value) })}
                  className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              )}
            </div>
            {creator.rightsOfUsage && creator.usageDurationDays && (
              <div className={`mt-1 text-[11px] font-medium ${usageExpired ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"}`}>
                {usageExpiry
                  ? `${usageExpired ? "Expired" : "Expires"} ${usageExpiry.toLocaleDateString("en-IN")}`
                  : "Expiry pending go-live"}
              </div>
            )}
          </div>
        )}
      </td>
      <EditableDualNumberCell
        showA={showInstagram}
        valueA={creator.followers}
        labelA="IG"
        onSaveA={(v) => updateCreatorShortlist(creator.id, { followers: v })}
        showB={showYoutube}
        valueB={creator.youtubeSubscribers}
        labelB="YT"
        onSaveB={(v) => updateCreatorShortlist(creator.id, { youtubeSubscribers: v })}
        editable={false}
      />
      <EditableMultiNumberCell
        editable={false}
        items={[
          { show: showInstagram, value: creator.avgViews, label: "IG", onSave: (v) => updateCreatorShortlist(creator.id, { avgViews: v }) },
          { show: showYoutubeLong, value: creator.youtubeLongMedianViews, label: "YTL", onSave: (v) => updateCreatorShortlist(creator.id, { youtubeLongMedianViews: v }) },
          { show: showYoutubeShorts, value: creator.youtubeShortsMedianViews, label: "YTS", onSave: (v) => updateCreatorShortlist(creator.id, { youtubeShortsMedianViews: v }) },
        ]}
      />
      <EditableMultiNumberCell
        editable={false}
        suffix="%"
        step="0.01"
        items={[
          { show: showInstagram, value: creator.engagementRate, label: "IG", onSave: (v) => updateCreatorShortlist(creator.id, { engagementRate: v }) },
          { show: showYoutubeLong, value: creator.youtubeLongMedianERPercent, label: "YTL", onSave: (v) => updateCreatorShortlist(creator.id, { youtubeLongMedianERPercent: v }) },
          { show: showYoutubeShorts, value: creator.youtubeShortsMedianERPercent, label: "YTS", onSave: (v) => updateCreatorShortlist(creator.id, { youtubeShortsMedianERPercent: v }) },
        ]}
      />
      <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <button
          onClick={() => setShowInsights(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          <span>{links.length}</span>
        </button>
        {showInsights && (
          <InsightsPopup
            links={links}
            editable={!isClientView}
            onClose={() => setShowInsights(false)}
            onSave={(newLinks) => updateCreatorShortlist(creator.id, { insightsLinks: newLinks })}
          />
        )}
      </td>
      {canSeeCost && (
        <EditableNumberCell
          value={creator.internalCost ?? null}
          prefix="₹"
          editable={!isClientView}
          onSave={(v) => updateCreatorShortlist(creator.id, { internalCost: v })}
          textClassName="text-indigo-600 dark:text-indigo-400"
        />
      )}
      <EditableNumberCell
        value={creator.quotedCost}
        prefix="₹"
        editable={role === "CAMPAIGN_MANAGER"}
        onSave={(v) => updateCreatorShortlist(creator.id, { quotedCost: v })}
        textClassName="font-bold text-slate-900 dark:text-white"
      />
      <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {isClientView ? (
          <select
            defaultValue={creator.clientIntent ?? ""}
            onChange={(e) => setCreatorClientDecision(creator.id, { clientIntent: e.target.value || null })}
            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="">—</option>
            <option value="ONBOARD" disabled={creator.finalQuotedCost === null}>
              {creator.finalQuotedCost === null ? "Onboard (awaiting final costing)" : "Onboard"}
            </option>
            <option value="REJECTED">Reject</option>
            <option value="NEGOTIATING">Negotiate To</option>
          </select>
        ) : (
          <StatusBadge status={creator.clientIntent ?? "PENDING"} />
        )}
      </td>
      <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {isClientView ? (
          <input
            type="number"
            defaultValue={creator.clientCounterCost ?? ""}
            placeholder="₹"
            onBlur={(e) => setCreatorClientDecision(creator.id, { clientCounterCost: e.target.value === "" ? null : Number(e.target.value) })}
            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
        ) : (
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{creator.clientCounterCost ? `₹${creator.clientCounterCost.toLocaleString("en-IN")}` : "—"}</span>
        )}
      </td>
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {isClientView ? (
          <input
            defaultValue={creator.clientRemark ?? ""}
            placeholder="Remark"
            onBlur={(e) => setCreatorClientDecision(creator.id, { clientRemark: e.target.value || null })}
            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
        ) : (
          <span className="block truncate text-xs text-slate-600 dark:text-slate-400" title={creator.clientRemark ?? undefined}>{creator.clientRemark || "—"}</span>
        )}
      </td>
      <EditableNumberCell
        value={creator.finalQuotedCost}
        prefix="₹"
        editable={!isClientView}
        onSave={(v) => updateCreatorShortlist(creator.id, { finalQuotedCost: v })}
        textClassName="font-bold text-slate-900 dark:text-white"
      />
      <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {isClientView ? (
          <select
            defaultValue={creator.clientFinalIntent ?? ""}
            onChange={(e) => setCreatorClientDecision(creator.id, { clientFinalIntent: e.target.value || null })}
            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="">—</option>
            {(["ONBOARD", "REJECTED"] as const).map((o) => (
              <option key={o} value={o} disabled={o === "ONBOARD" && creator.finalQuotedCost === null}>
                {o === "ONBOARD" && creator.finalQuotedCost === null ? "Onboard (awaiting final costing)" : CLIENT_INTENT_LABELS[o]}
              </option>
            ))}
          </select>
        ) : (
          <StatusBadge status={creator.clientFinalIntent ?? "PENDING"} />
        )}
      </td>
      {!isClientView && (
        <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              if (confirm(`Remove ${creator.name} from the shortlist? This marks them as rejected — they'll drop off the board but their history is kept.`)) {
                rejectCreator(creator.id, "Removed from shortlist");
              }
            }}
            title="Remove from shortlist"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      )}
    </tr>
  );
}

// ---------- Onboarding page ----------

const DEFAULT_GO_LIVE_DAYS = 15;

// Script/Content statuses that mean "sent to the client, waiting on them" —
// everything else not-yet-live is presumed to need TBM's own next action.
// Matches the exact option lists in the Script Status / Video Status
// dropdowns further down this file.
const CLIENT_WAITING_SCRIPT_STATUSES = new Set(["CONCEPT_APPROVAL", "SENT_FOR_APPROVAL"]);
const CLIENT_WAITING_CONTENT_STATUSES = new Set(["EXTERNAL_APPROVAL"]);

function deliverableNeedsClientAction(d: Deliverable): boolean {
  return (
    !d.liveLink &&
    ((d.scriptStatus != null && CLIENT_WAITING_SCRIPT_STATUSES.has(d.scriptStatus)) ||
      (d.contentStatus != null && CLIENT_WAITING_CONTENT_STATUSES.has(d.contentStatus)))
  );
}

function deliverableNeedsTBMAction(d: Deliverable): boolean {
  return !d.liveLink && !deliverableNeedsClientAction(d);
}

// Same breach/dormant math as the per-row Flag/Alert badge below (kept as a
// duplicate rather than a shared export, matching this file's existing
// pattern of small structural checks living next to each caller) — used for
// this campaign-wide "Flagged Rows" count above the table.
function isCreatorFlagged(creator: Creator, activityLogs: ActivityLogEntry[]): boolean {
  const onboardedAt = creator.onboardedAt ? new Date(creator.onboardedAt) : null;
  const effectiveDeadline = creator.goLiveDeadline
    ? new Date(creator.goLiveDeadline)
    : onboardedAt
    ? new Date(onboardedAt.getTime() + DEFAULT_GO_LIVE_DAYS * 24 * 60 * 60 * 1000)
    : null;

  const relevantEntityIds = new Set([creator.id, ...creator.deliverables.map((d) => d.id)]);
  const creatorLogs = activityLogs.filter((l) => relevantEntityIds.has(l.entityId));
  const lastAction = creatorLogs[0] ?? null;

  const now = Date.now();
  const hoursSinceLastAction = lastAction ? (now - new Date(lastAction.createdAt).getTime()) / (60 * 60 * 1000) : null;
  const deadlineBreached = effectiveDeadline ? now > effectiveDeadline.getTime() : false;
  const dormant = hoursSinceLastAction !== null && hoursSinceLastAction >= 48;

  return deadlineBreached || dormant;
}

function creatorEffectiveDeadline(creator: Creator): Date | null {
  const onboardedAt = creator.onboardedAt ? new Date(creator.onboardedAt) : null;
  return creator.goLiveDeadline
    ? new Date(creator.goLiveDeadline)
    : onboardedAt
    ? new Date(onboardedAt.getTime() + DEFAULT_GO_LIVE_DAYS * 24 * 60 * 60 * 1000)
    : null;
}

// The Onboarded sheet tab's own campaign-level summary strip, shown above
// the creator table: Onboarded Creators, Deliverables Live/Total, Action
// needed at TBM / at Client (deliverable-level), Creator level action
// (creator-level, any pending deliverable), Flagged Rows, Deadline this
// week, and Project Deadline (the latest effective deadline across every
// onboarded creator — same value Campaign.goLiveDeadline is kept in sync
// with elsewhere).
function OnboardingSummaryStrip({ creators, activityLogs }: { creators: Creator[]; activityLogs: ActivityLogEntry[] }) {
  const allDeliverables = creators.flatMap((c) => c.deliverables);
  const liveCount = allDeliverables.filter((d) => Boolean(d.liveLink)).length;
  const actionAtTBM = allDeliverables.filter(deliverableNeedsTBMAction).length;
  const actionAtClient = allDeliverables.filter(deliverableNeedsClientAction).length;
  const creatorLevelAction = creators.filter((c) => c.deliverables.some((d) => !d.liveLink)).length;
  const flaggedRows = creators.filter((c) => isCreatorFlagged(c, activityLogs)).length;

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const deadlines = creators.map(creatorEffectiveDeadline).filter((d): d is Date => d !== null);
  const deadlineThisWeek = deadlines.filter((d) => d.getTime() >= now && d.getTime() - now <= sevenDaysMs).length;
  const projectDeadline = deadlines.length > 0 ? new Date(Math.max(...deadlines.map((d) => d.getTime()))) : null;

  const stats: { label: string; value: string }[] = [
    { label: "Onboarded Creators", value: String(creators.length) },
    { label: "Deliverables Live/Total", value: `${liveCount}/${allDeliverables.length}` },
    { label: "Action needed at TBM", value: String(actionAtTBM) },
    { label: "Action needed at Client", value: String(actionAtClient) },
    { label: "Creator level action", value: String(creatorLevelAction) },
    { label: "Flagged Rows", value: String(flaggedRows) },
    { label: "Deadline this week", value: String(deadlineThisWeek) },
    {
      label: "Project Deadline",
      value: projectDeadline ? projectDeadline.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-4 lg:grid-cols-8">
      {stats.map((s) => (
        <div key={s.label}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{s.label}</p>
          <p className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function prettyAction(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// Small popup listing every logged action for one creator (creator-level +
// every deliverable under them) — the audit trail the brief calls for,
// openable from the Last Action cell.
function ActivityHistoryPopup({ logs, onClose }: { logs: ActivityLogEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 dark:bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Activity history</h4>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
          {logs.length === 0 && <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">No logged actions yet.</p>}
          {logs.map((l) => (
            <div key={l.id} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">{prettyAction(l.action)}</span>
                <span className="text-slate-400 dark:text-slate-500">{formatDateTime(new Date(l.createdAt))}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">by {l.actorName}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OnboardingCreatorRow({
  creator,
  isClientView,
  internalUsers,
  activityLogs,
  canApproveCost,
  canSetCost,
}: {
  creator: Creator;
  isClientView: boolean;
  internalUsers: { id: string; name: string; role: string }[];
  activityLogs: ActivityLogEntry[];
  canApproveCost: boolean;
  canSetCost: boolean;
}) {
  const [showInsights, setShowInsights] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState("");
  const [deadlineReason, setDeadlineReason] = useState("");
  const [editingCost, setEditingCost] = useState(false);
  const [costDraft, setCostDraft] = useState("");
  const [costReason, setCostReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [, forceTick] = useState(0);

  // Re-render once a minute so Time Remaining / Flag keep counting down
  // without needing a full page reload.
  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  async function handleRefreshStats() {
    setRefreshing(true);
    setRefreshMsg(null);
    const result = await refreshCreatorSocialStats(creator.id);
    setRefreshing(false);
    if (!result.changed) {
      setRefreshMsg(result.igError || result.ytError ? (result.igError ?? result.ytError ?? "No fresher data found.") : "Already up to date.");
      return;
    }
    const summary = result.changes
      .map((c) => {
        const delta = (c.after ?? 0) - (c.before ?? 0);
        const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
        return `${c.field}: ${(c.before ?? 0).toLocaleString("en-IN")} ${arrow} ${(c.after ?? 0).toLocaleString("en-IN")}`;
      })
      .join(", ");
    setRefreshMsg(summary);
  }

  const hasInstagramDeliverable = creator.shortlistDeliverables.some(
    (d) => SHORTLIST_DELIVERABLE_SOCIAL[d.deliverableType as keyof typeof SHORTLIST_DELIVERABLE_SOCIAL] === "INSTAGRAM"
  );
  const hasYoutubeLongDeliverable = creator.shortlistDeliverables.some((d) => d.deliverableType === "YT_DEDICATED" || d.deliverableType === "YT_INTEGRATED" || d.deliverableType === "YT_CONCEPTUAL");
  const hasYoutubeShortsDeliverable = creator.shortlistDeliverables.some((d) => d.deliverableType === "YT_SHORTS");
  const hasYoutubeDeliverable = hasYoutubeLongDeliverable || hasYoutubeShortsDeliverable;
  const noDeliverablesYet = creator.shortlistDeliverables.length === 0;
  const showInstagram = noDeliverablesYet ? Boolean(creator.channelHandle) : hasInstagramDeliverable;
  const showYoutube = noDeliverablesYet ? Boolean(creator.youtubeUrl) : hasYoutubeDeliverable;
  const showYoutubeLong = noDeliverablesYet ? Boolean(creator.youtubeUrl) : hasYoutubeLongDeliverable;
  const showYoutubeShorts = noDeliverablesYet ? false : hasYoutubeShortsDeliverable;

  let links: string[] = [];
  try {
    links = creator.insightsLinks ? JSON.parse(creator.insightsLinks) : [];
  } catch {
    links = [];
  }

  // Deadline: per-creator override if set, else onboard date + the default
  // window — always something to show, never a bare "—".
  const onboardedAt = creator.onboardedAt ? new Date(creator.onboardedAt) : null;
  const effectiveDeadline = creator.goLiveDeadline
    ? new Date(creator.goLiveDeadline)
    : onboardedAt
    ? new Date(onboardedAt.getTime() + DEFAULT_GO_LIVE_DAYS * 24 * 60 * 60 * 1000)
    : null;

  const relevantEntityIds = new Set([creator.id, ...creator.deliverables.map((d) => d.id)]);
  const creatorLogs = activityLogs.filter((l) => relevantEntityIds.has(l.entityId));
  const lastAction = creatorLogs[0] ?? null; // activityLogs arrives sorted newest-first

  const now = Date.now();
  const hoursSinceLastAction = lastAction ? (now - new Date(lastAction.createdAt).getTime()) / (60 * 60 * 1000) : null;
  const deadlineBreached = effectiveDeadline ? now > effectiveDeadline.getTime() : false;
  const deadlineApproaching = effectiveDeadline ? effectiveDeadline.getTime() - now < 3 * 24 * 60 * 60 * 1000 && !deadlineBreached : false;
  const dormant = hoursSinceLastAction !== null && hoursSinceLastAction >= 48;

  let flag: { label: string; tone: "emerald" | "amber" | "rose" };
  if (deadlineBreached) flag = { label: "Go-live deadline breached", tone: "rose" };
  else if (dormant) flag = { label: "No action in 48h, creator unattended", tone: "rose" };
  else if (deadlineApproaching) flag = { label: "Deadline approaching", tone: "amber" };
  else flag = { label: "On track", tone: "emerald" };

  const flagClasses: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60",
    amber: "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60",
    rose: "bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60",
  };

  let timeRemainingText = "—";
  let timeRemainingTone = "text-slate-500 dark:text-slate-400";
  if (effectiveDeadline) {
    const diffMs = effectiveDeadline.getTime() - now;
    const diffDays = Math.ceil(Math.abs(diffMs) / (24 * 60 * 60 * 1000));
    if (diffMs < 0) {
      timeRemainingText = `Overdue by ${diffDays}d`;
      timeRemainingTone = "text-rose-600 dark:text-rose-400 font-semibold";
    } else if (diffDays <= 3) {
      timeRemainingText = `${diffDays}d left`;
      timeRemainingTone = "text-amber-600 dark:text-amber-400 font-semibold";
    } else {
      timeRemainingText = `${diffDays}d left`;
    }
  }

  function openDeadlineEditor() {
    setDeadlineDraft(effectiveDeadline ? effectiveDeadline.toISOString().slice(0, 10) : "");
    setDeadlineReason("");
    setEditingDeadline(true);
  }

  async function saveDeadline() {
    if (!deadlineDraft || !deadlineReason.trim()) return;
    await updateCreatorDeadline(creator.id, deadlineDraft, deadlineReason.trim());
    setEditingDeadline(false);
  }

  function openCostEditor() {
    setCostDraft(creator.finalQuotedCost != null ? String(creator.finalQuotedCost) : "");
    setCostReason("");
    setEditingCost(true);
  }

  async function saveCost() {
    const value = Number(costDraft);
    if (!costDraft || Number.isNaN(value) || !costReason.trim()) return;
    await requestFinalCostEdit(creator.id, value, costReason.trim());
    setEditingCost(false);
  }

  return (
    <tr className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
      <td className="sticky left-0 z-10 w-[200px] min-w-[200px] max-w-[200px] whitespace-nowrap overflow-hidden text-ellipsis border-b border-slate-100 bg-white px-5 py-4 font-bold text-slate-900 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:group-hover:bg-slate-800">
        <span className="block truncate">{creator.name}</span>
        <div className="truncate text-xs text-slate-400 dark:text-slate-500 font-medium">{creator.channelHandle}</div>
      </td>
      <td className="sticky left-[200px] z-10 w-[230px] min-w-[230px] max-w-[230px] border-b border-slate-100 bg-white px-5 py-4 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
        <div className="flex flex-col gap-1">
          {/* Same two-line format for every creator: top line is "@handle"
              linking to the Instagram profile, bottom line is "YouTube"
              linking to the YouTube channel — like mrbeast's row. For a
              YouTube-primary creator whose Instagram was detected from their
              YT description (a different handle than channelHandle), the
              top line shows that real Instagram handle instead of
              channelHandle, so the displayed @text always matches where it
              actually links. */}
          {(() => {
            const isYoutubePrimary = creator.platformPrimary === "YOUTUBE_LONG" || creator.platformPrimary === "YOUTUBE_SHORTS";
            const instagramHandleFromUrl = creator.profileUrl?.match(/instagram\.com\/([^/?#]+)/i)?.[1] ?? null;
            const topLineHandle = isYoutubePrimary ? (instagramHandleFromUrl ? `@${instagramHandleFromUrl}` : null) : creator.channelHandle;
            return (
              <>
                {topLineHandle &&
                  (creator.profileUrl ? (
                    <a href={creator.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                      <span>{topLineHandle}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{topLineHandle}</span>
                  ))}
                {isYoutubePrimary && !instagramHandleFromUrl && (
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{creator.channelHandle}</span>
                )}
                {showYoutube &&
                  (creator.youtubeUrl ? (
                    <a href={creator.youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                      <span>YouTube</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">YouTube (no link yet)</span>
                  ))}
              </>
            );
          })()}
          {!creator.channelHandle && !showYoutube && <span className="text-xs text-slate-400 dark:text-slate-500">—</span>}
          {!isClientView && (
            <button
              type="button"
              onClick={handleRefreshStats}
              disabled={refreshing}
              title="Pull the latest captured Followers/Subscribers/etc. into this row"
              className="inline-flex w-fit items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-600 disabled:opacity-50 dark:text-slate-500 dark:hover:text-indigo-400"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Refreshing…" : "Refresh stats"}</span>
            </button>
          )}
          {refreshMsg && <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{refreshMsg}</span>}
        </div>
      </td>
      <td className="sticky left-[430px] z-10 w-[260px] min-w-[260px] max-w-[260px] border-b border-slate-100 bg-white px-5 py-4 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
        <div className="flex flex-col items-start gap-1">
          {creator.deliverables.map((d) => (
            <span key={d.id} className="inline-flex w-full items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {isClientView ? (
                <span className="min-w-0 flex-1 truncate">{d.title || (PLATFORM_LABELS[d.platform as keyof typeof PLATFORM_LABELS] ?? d.platform)}</span>
              ) : (
                <input
                  defaultValue={d.title ?? ""}
                  placeholder={PLATFORM_LABELS[d.platform as keyof typeof PLATFORM_LABELS] ?? d.platform}
                  onBlur={(e) => {
                    if (e.target.value !== (d.title ?? "")) updateDeliverableTitle(d.id, e.target.value);
                  }}
                  className="min-w-0 flex-1 border-none bg-transparent p-0 text-[11px] font-semibold text-slate-700 placeholder:text-slate-500 focus:outline-none dark:text-slate-300 dark:placeholder:text-slate-400"
                />
              )}
              {!isClientView && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete this deliverable? This can't be undone.")) deleteDeliverable(d.id);
                  }}
                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {creator.deliverables.length === 0 && <span className="text-xs text-slate-400 dark:text-slate-500">—</span>}
          {!isClientView && (
            <select
              value=""
              onChange={(e) => {
                const platform = e.target.value;
                if (!platform) return;
                const fd = new FormData();
                fd.set("platform", platform);
                addDeliverable(creator.id, fd);
                e.target.value = "";
              }}
              className="w-full rounded-lg border border-dashed border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
            >
              <option value="">+ Add</option>
              {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          )}
        </div>
      </td>

      {/* Rights of Usage — display-only here, carried from Shortlist */}
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          <div>{creator.rightsOfUsage ? `Yes${creator.usageDurationDays ? ` (${creator.usageDurationDays}d)` : ""}` : "No"}</div>
        </div>
      </td>

      <EditableDualNumberCell
        showA={showInstagram}
        valueA={creator.followers}
        labelA="IG"
        onSaveA={() => {}}
        showB={showYoutube}
        valueB={creator.youtubeSubscribers}
        labelB="YT"
        onSaveB={() => {}}
        editable={false}
      />
      <EditableMultiNumberCell
        editable={false}
        items={[
          { show: showInstagram, value: creator.avgViews, label: "IG", onSave: () => {} },
          { show: showYoutubeLong, value: creator.youtubeLongMedianViews, label: "YTL", onSave: () => {} },
          { show: showYoutubeShorts, value: creator.youtubeShortsMedianViews, label: "YTS", onSave: () => {} },
        ]}
      />
      <EditableMultiNumberCell
        editable={false}
        suffix="%"
        items={[
          { show: showInstagram, value: creator.engagementRate, label: "IG", onSave: () => {} },
          { show: showYoutubeLong, value: creator.youtubeLongMedianERPercent, label: "YTL", onSave: () => {} },
          { show: showYoutubeShorts, value: creator.youtubeShortsMedianERPercent, label: "YTS", onSave: () => {} },
        ]}
      />

      <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <button
          onClick={() => setShowInsights(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          <span>{links.length}</span>
        </button>
        {showInsights && (
          <InsightsPopup
            links={links}
            editable={!isClientView}
            onClose={() => setShowInsights(false)}
            onSave={(newLinks) => updateCreatorShortlist(creator.id, { insightsLinks: newLinks })}
          />
        )}
      </td>

      {/* Final Quoted Cost — locked. Editing after lock requires a reason +
          dual CM/Brand-Solutions approval (requestFinalCostEdit). */}
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {!editingCost ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {creator.finalQuotedCost != null ? `₹${creator.finalQuotedCost.toLocaleString("en-IN")}` : "—"}
            </span>
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">(closed)</span>
            {!isClientView && canSetCost && (
              <button onClick={openCostEditor} className="text-slate-300 hover:text-indigo-600 dark:text-slate-600 dark:hover:text-indigo-400" title="Request a cost change">
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <input
              type="number"
              value={costDraft}
              onChange={(e) => setCostDraft(e.target.value)}
              placeholder="New cost"
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            <input
              value={costReason}
              onChange={(e) => setCostReason(e.target.value)}
              placeholder="Reason (required)"
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            <div className="flex gap-1">
              <button onClick={saveCost} className="rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700">
                {canApproveCost ? "Save" : "Request"}
              </button>
              <button onClick={() => setEditingCost(false)} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Cancel
              </button>
            </div>
            {!canApproveCost && <span className="text-[10px] text-slate-400 dark:text-slate-500">Needs CM/Brand Solutions approval to apply.</span>}
          </div>
        )}
      </td>

      {/* POC */}
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {isClientView ? (
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{creator.poc?.name ?? "—"}</span>
        ) : (
          <select
            defaultValue={creator.pocUserId ?? ""}
            onChange={(e) => assignCreatorPOC(creator.id, e.target.value || null)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="">Unassigned</option>
            {internalUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </td>

      {/* Product Status — per deliverable */}
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {creator.deliverables.length === 0 ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            {creator.deliverables.map((d) => (
              <div key={d.id} className="flex items-center gap-1">
                {creator.deliverables.length > 1 && (
                  <span className="w-7 shrink-0 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">{platformShortLabel(d.platform)}</span>
                )}
                {isClientView ? (
                  <StatusBadge status={d.productStatus ?? "—"} />
                ) : (
                  <select
                    defaultValue={d.productStatus ?? ""}
                    onChange={(e) => updateProductStatus(d.id, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="">—</option>
                    <option value="ORDERED">Order placed</option>
                    <option value="IN_TRANSIT">In transit</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="INSTALLATION_PENDING">Installation pending</option>
                    <option value="INSTALLED">Installed</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </td>

      {/* Script Status — per deliverable */}
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {creator.deliverables.length === 0 ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            {creator.deliverables.map((d) => (
              <div key={d.id} className="flex items-center gap-1">
                {creator.deliverables.length > 1 && (
                  <span className="w-7 shrink-0 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">{platformShortLabel(d.platform)}</span>
                )}
                {isClientView ? (
                  <StatusBadge status={d.scriptStatus ?? "—"} />
                ) : (
                  <select
                    defaultValue={d.scriptStatus ?? ""}
                    onChange={(e) => updateScriptStatus(d.id, e.target.value, d.scriptDocUrl ?? undefined)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="">—</option>
                    <option value="CONCEPT_DEVELOPMENT">Concept development</option>
                    <option value="CONCEPT_APPROVAL">Concept approval</option>
                    <option value="CONCEPT_APPROVED">Concept approved</option>
                    <option value="SENT_FOR_APPROVAL">Script sent for approval</option>
                    <option value="FEEDBACK">Feedback marked</option>
                    <option value="REVISED">Revised</option>
                    <option value="APPROVED">Script approved</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </td>

      {/* Script Link — per deliverable */}
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {creator.deliverables.length === 0 ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            {creator.deliverables.map((d) =>
              isClientView ? (
                <div key={d.id}>
                  {d.scriptDocUrl ? (
                    <a href={d.scriptDocUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                      <span>Open</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                  )}
                </div>
              ) : (
                <input
                  key={d.id}
                  defaultValue={d.scriptDocUrl ?? ""}
                  placeholder="Drive link"
                  onBlur={(e) => {
                    if (e.target.value !== (d.scriptDocUrl ?? "")) updateScriptStatus(d.id, d.scriptStatus ?? "", e.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              )
            )}
          </div>
        )}
      </td>

      {/* Video / Content Status — per deliverable */}
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {creator.deliverables.length === 0 ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            {creator.deliverables.map((d) => (
              <div key={d.id} className="flex items-center gap-1">
                {creator.deliverables.length > 1 && (
                  <span className="w-7 shrink-0 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">{platformShortLabel(d.platform)}</span>
                )}
                {isClientView ? (
                  <StatusBadge status={d.status === "LIVE" ? "LIVE" : d.contentStatus ?? "—"} />
                ) : (
                  <select
                    defaultValue={d.contentStatus ?? ""}
                    onChange={(e) => updateContentStatus(d.id, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="">—</option>
                    <option value="IN_SHOOT">In shoot</option>
                    <option value="INTERNAL_APPROVAL">Internal quality check</option>
                    <option value="EXTERNAL_APPROVAL">Sent for approval</option>
                    <option value="CHANGES_REQUESTED">Changes requested</option>
                    <option value="APPROVED">Approved</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </td>

      {/* Live Video Link — per deliverable; pasting one triggers tracking */}
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {creator.deliverables.length === 0 ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            {creator.deliverables.map((d) =>
              isClientView || d.liveLink ? (
                <div key={d.id}>
                  {d.liveLink ? (
                    <a href={d.liveLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                      <span>Live</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                  )}
                </div>
              ) : (
                <input
                  key={d.id}
                  placeholder="Paste live URL"
                  onBlur={(e) => {
                    if (e.target.value.trim()) addLiveLink(d.id, e.target.value.trim());
                  }}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              )
            )}
          </div>
        )}
      </td>

      {/* Deadline */}
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {!editingDeadline ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {effectiveDeadline ? effectiveDeadline.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
            </span>
            {!isClientView && (
              <button onClick={openDeadlineEditor} className="text-slate-300 hover:text-indigo-600 dark:text-slate-600 dark:hover:text-indigo-400" title="Change deadline (reason required)">
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <input
              type="date"
              value={deadlineDraft}
              onChange={(e) => setDeadlineDraft(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            <input
              value={deadlineReason}
              onChange={(e) => setDeadlineReason(e.target.value)}
              placeholder="Reason (required)"
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            <div className="flex gap-1">
              <button onClick={saveDeadline} className="rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700">
                Save
              </button>
              <button onClick={() => setEditingDeadline(false)} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Cancel
              </button>
            </div>
          </div>
        )}
      </td>

      {/* Time Remaining */}
      <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <span className={`text-xs ${timeRemainingTone}`}>{timeRemainingText}</span>
      </td>

      {/* Last Action */}
      <td className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        {lastAction ? (
          <button onClick={() => setShowHistory(true)} className="flex items-center gap-1.5 text-left hover:text-indigo-600 dark:hover:text-indigo-400">
            <History className="h-3 w-3 flex-shrink-0 text-slate-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {formatDateTime(new Date(lastAction.createdAt))}, {lastAction.actorName}
            </span>
          </button>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
        )}
        {showHistory && <ActivityHistoryPopup logs={creatorLogs} onClose={() => setShowHistory(false)} />}
      </td>

      {/* Flag / Alert */}
      <td className="w-[260px] whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <span
          className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${flagClasses[flag.tone]}`}
        >
          {flag.tone === "rose" && <AlertTriangle className="h-3 w-3 flex-shrink-0" />}
          {flag.tone === "amber" && <Clock className="h-3 w-3 flex-shrink-0" />}
          {flag.tone === "emerald" && <CheckCircle2 className="h-3 w-3 flex-shrink-0" />}
          <span className="whitespace-nowrap">{flag.label}</span>
        </span>
      </td>

      <td className="w-6 border-b border-slate-100 dark:border-slate-800" aria-hidden />
    </tr>
  );
}

// Plain-text display when not editable, an inline number input (save on
// blur) when it is — used for every IR-entered numeric field in the
// shortlist table so those cells don't need a form/submit round trip.
function EditableNumberCell({
  value,
  editable,
  onSave,
  prefix,
  suffix,
  step,
  textClassName,
}: {
  value: number | null | undefined;
  editable: boolean;
  onSave: (value: number | null) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
  textClassName?: string;
}) {
  if (!editable) {
    return (
      <td className={`whitespace-nowrap border-b border-slate-100 px-5 py-4 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-300 ${textClassName ?? ""}`}>
        {value !== null && value !== undefined ? `${prefix ?? ""}${value.toLocaleString("en-IN")}${suffix ?? ""}` : "—"}
      </td>
    );
  }
  return (
    <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
      <input
        type="number"
        step={step}
        defaultValue={value ?? ""}
        onBlur={(e) => onSave(e.target.value === "" ? null : Number(e.target.value))}
        className={`w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 ${textClassName ?? ""}`}
      />
    </td>
  );
}

// Like EditableNumberCell, but for cells that can hold both an Instagram and
// a YouTube number in the same row — shows both stacked with a small label
// when a creator is pitched on both platforms, or just the one number
// (unlabeled) when they're only pitched on one.
function EditableDualNumberCell({
  showA,
  valueA,
  labelA,
  onSaveA,
  showB,
  valueB,
  labelB,
  onSaveB,
  editable,
  prefix,
  suffix,
  step,
}: {
  showA: boolean;
  valueA: number | null | undefined;
  labelA: string;
  onSaveA: (value: number | null) => void;
  showB: boolean;
  valueB: number | null | undefined;
  labelB: string;
  onSaveB: (value: number | null) => void;
  editable: boolean;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  if (!showA && !showB) {
    return <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">—</td>;
  }

  const showBoth = showA && showB;

  const renderValue = (value: number | null | undefined, label: string, onSave: (value: number | null) => void) => (
    <div className="flex items-center gap-1">
      {showBoth && <span className="w-6 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">{label}</span>}
      {editable ? (
        <input
          type="number"
          step={step}
          defaultValue={value ?? ""}
          onBlur={(e) => onSave(e.target.value === "" ? null : Number(e.target.value))}
          className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
      ) : (
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {value !== null && value !== undefined ? `${prefix ?? ""}${value.toLocaleString("en-IN")}${suffix ?? ""}` : "—"}
        </span>
      )}
    </div>
  );

  return (
    <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
      <div className="flex flex-col gap-1">
        {showA && renderValue(valueA, labelA, onSaveA)}
        {showB && renderValue(valueB, labelB, onSaveB)}
      </div>
    </td>
  );
}

// Like EditableDualNumberCell but for up to 3 values in one cell — used for
// Median Views/ER%, which split into Instagram, YouTube long-form, and
// YouTube Shorts (each performs differently, unlike Audience Size which is
// just one shared subscriber count for YouTube regardless of format).
function EditableMultiNumberCell({
  items,
  editable,
  prefix,
  suffix,
  step,
}: {
  items: { show: boolean; value: number | null | undefined; label: string; onSave: (value: number | null) => void }[];
  editable: boolean;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  const visible = items.filter((item) => item.show);
  if (visible.length === 0) {
    return <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">—</td>;
  }
  const showLabels = visible.length > 1;

  return (
    <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 dark:border-slate-800">
      <div className="flex flex-col gap-1">
        {visible.map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            {showLabels && <span className="w-8 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">{item.label}</span>}
            {editable ? (
              <input
                type="number"
                step={step}
                defaultValue={item.value ?? ""}
                onBlur={(e) => item.onSave(e.target.value === "" ? null : Number(e.target.value))}
                className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            ) : (
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {item.value !== null && item.value !== undefined ? `${prefix ?? ""}${item.value.toLocaleString("en-IN")}${suffix ?? ""}` : "—"}
              </span>
            )}
          </div>
        ))}
      </div>
    </td>
  );
}

// Reads an image file, downsizes it (max 900px on the long edge, JPEG q=0.75)
// so it stores reasonably in the DB, and resolves a data-URL string.
function fileToCompressedDataUrl(file: File, maxDim = 900, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Image processing isn't supported here."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// A vertical (portrait, like a real screenshot) single-image viewer with
// arrow navigation between shots — IR can attach as many screenshots as
// needed (no fixed cap), clients just browse through them.
function InsightsPopup({
  links,
  editable,
  onClose,
  onSave,
}: {
  links: string[];
  editable: boolean;
  onClose: () => void;
  onSave: (links: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(links);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const items = editable ? draft : links;
  const total = items.length;
  const current = total > 0 ? Math.min(index, total - 1) : 0;

  function goPrev() {
    setIndex((i) => (total === 0 ? 0 : (i - 1 + total) % total));
  }
  function goNext() {
    setIndex((i) => (total === 0 ? 0 : (i + 1) % total));
  }

  async function handleAddFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setDraft((d) => {
        const next = [...d, dataUrl];
        setIndex(next.length - 1);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that image.");
    }
  }

  function removeCurrent() {
    setDraft((d) => {
      const next = d.filter((_, i) => i !== current);
      setIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 dark:bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            Insights {total > 0 && <span className="font-medium text-slate-400 dark:text-slate-500">({current + 1}/{total})</span>}
          </h4>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="relative mx-auto w-full max-w-[280px] aspect-[9/16] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            {total === 0 ? (
              editable ? (
                <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 dark:border-slate-700 dark:text-slate-500 dark:hover:border-indigo-500">
                  <ImageIcon className="h-7 w-7" />
                  <span className="text-xs font-semibold">Add screenshot</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAddFile(e.target.files?.[0])} />
                </label>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-slate-400 dark:text-slate-500">No screenshots added yet.</div>
              )
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={items[current]}
                  alt={`Insight ${current + 1}`}
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {editable && (
                  <button
                    type="button"
                    onClick={removeCurrent}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    title="Remove this image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {total > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goPrev}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
                      title="Previous image"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
                      title="Next image"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {editable && total > 0 && (
            <label className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-semibold text-indigo-600 hover:border-indigo-400 dark:border-slate-700 dark:text-indigo-400 dark:hover:border-indigo-500">
              <Plus className="h-3.5 w-3.5" />
              <span>Add another screenshot</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAddFile(e.target.files?.[0])} />
            </label>
          )}

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

          {editable && (
            <button
              onClick={() => {
                onSave(draft);
                onClose();
              }}
              className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

