"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { canApproveCommercialEdit, canSetCommercials, canSeeInternalCost, canManageTeam, canCreateCampaign, isClient } from "@/lib/rbac";
import {
  DEFAULT_SLA,
  type Stage,
  INTERNAL_ROLES,
  type Role,
  SHORTLIST_DELIVERABLE_TYPES,
  SHORTLIST_DELIVERABLE_LABELS,
  SHORTLIST_TO_EXECUTION_PLATFORM,
  type ShortlistDeliverableType,
  MIN_SCOUTING_FOLLOWERS,
  CAMPAIGN_STATUSES,
  INVOICE_STATUSES,
  PAYOUT_PAYMENT_STATUSES,
} from "@/lib/constants";
import { extractInstagramUsername } from "@/lib/instagram";
import {
  fetchYoutubeChannelStats,
  fetchYoutubeChannelNiche,
  fetchYoutubeChannelInstagramHandle,
  resolveYoutubeChannelCanonicalUrl,
  searchYoutubeChannels,
  isLikelyIndianChannel,
  YoutubeLookupError,
} from "@/lib/youtube";
import { appendInstagramHandleToSheet } from "@/lib/googleSheets";

// Prisma's unique-constraint-violation error code — checked structurally
// (not via `instanceof Prisma.PrismaClientKnownRequestError`) to avoid
// importing the whole Prisma namespace into this file just for one error
// code. Used wherever a DB-level @unique constraint (see schema.prisma) is
// the real guard and app code just needs to turn the raw error into a
// friendly message.
function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

// Clients and internal staff now live in separate tables (User vs Client),
// but a lot of actions below (remarks, activity log, review decisions) can
// be taken by either. These two helpers build the right FK object from the
// current session user so each call site doesn't have to repeat the
// isClient() branch — spread the result into the Prisma `data`.
function actorFields(user: { id: string; role: Role }) {
  return isClient(user.role) ? { actorClientId: user.id } : { actorId: user.id };
}
function authorFields(user: { id: string; role: Role }) {
  return isClient(user.role) ? { authorClientId: user.id } : { authorId: user.id };
}

// ---------- Campaign ----------

export async function createCampaign(formData: FormData) {
  const user = await requireUser();
  if (!canCreateCampaign(user.role)) throw new Error("Only a CXO or Brand Solutions can create a campaign.");

  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  const budgetQuoted = Number(formData.get("budgetQuoted") ?? 0) || null;
  const platformMix = String(formData.get("platformMix") ?? "").trim() || null;
  if (!name || !brand || !brief) throw new Error("Name, brand and brief are required");

  const campaign = await prisma.campaign.create({
    data: {
      name,
      brand,
      brief,
      budgetQuoted: budgetQuoted ?? undefined,
      platformMix: platformMix ?? undefined,
      createdById: user.id,
      slaClientFeedbackHours: DEFAULT_SLA.clientFeedbackHours,
      slaScriptFromCreatorDays: DEFAULT_SLA.scriptFromCreatorDays,
      slaContentFromCreatorDays: DEFAULT_SLA.contentFromCreatorDays,
      slaOnboardToGoLiveDays: DEFAULT_SLA.onboardToGoLiveDays,
      // Campaign visibility is now scoped to team assignment for everyone
      // except CXO (see campaignVisibilityWhere in rbac.ts) — without this,
      // the creator would immediately lose access to the campaign they just
      // made, since nothing else adds them as a team member automatically.
      teamMembers: { create: [{ userId: user.id, roleOnCampaign: user.role }] },
    },
  });

  await logActivity({
    campaignId: campaign.id,
    actorId: user.id,
    actorName: user.name,
    action: "CAMPAIGN_CREATED",
    entityType: "Campaign",
    entityId: campaign.id,
  });

  revalidatePath("/campaigns");
  return campaign.id;
}

// Sets Active/Hold/Closed on a campaign — used by the status dropdown in the
// dashboard's Campaign Table (and anywhere else that needs it later). Any
// non-client internal user can pause/close a campaign, same as other
// campaign-level edits in this file. Campaigns are never deleted — status
// (e.g. Cancelled) is the only way a campaign leaves the active set.
export async function updateCampaignStatus(campaignId: string, status: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot change campaign status");
  if (!(CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
    throw new Error("Invalid status.");
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status } });

  await logActivity({
    campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "CAMPAIGN_STATUS_CHANGED",
    entityType: "Campaign",
    entityId: campaignId,
    meta: { status },
  });

  revalidatePath("/dashboard");
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
}

// Manual entry for the four Finance numbers the dashboard's Summary row
// needs (Yet to be Invoiced / Yet to be Received / Value of Cleared Due /
// Creator Payable Pending) — see the schema comment on Campaign. Gated the
// same way internal cost fields are elsewhere (canSeeInternalCost), since
// these are finance-sensitive and clients must never see or set them.
export async function updateCampaignFinance(
  campaignId: string,
  fields: {
    financeYetToBeInvoiced?: number | null;
    financeYetToBeReceived?: number | null;
    financeValueOfClearedDue?: number | null;
    financeCreatorPayablePending?: number | null;
    financeAgencyFee?: number | null;
    financeAgencyFeePercent?: number | null;
    financeClientInvoiceStatus?: string | null;
  }
) {
  const user = await requireUser();
  if (!canSeeInternalCost(user.role)) throw new Error("Not authorized to edit finance figures.");
  if (
    fields.financeClientInvoiceStatus != null &&
    !(INVOICE_STATUSES as readonly string[]).includes(fields.financeClientInvoiceStatus)
  ) {
    throw new Error("Invalid invoice status.");
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: fields });

  await logActivity({
    campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "CAMPAIGN_FINANCE_UPDATED",
    entityType: "Campaign",
    entityId: campaignId,
    meta: fields,
  });

  revalidatePath("/dashboard");
  revalidatePath(`/campaigns/${campaignId}`);
}

// Finance & Invoicing — Creator side payouts (section A of the sheet's
// separate spec). Same gating as updateCampaignFinance: TBM finance/IR eyes
// only, never client-editable. campaignId is only used to know which pages
// to revalidate.
export async function updateCreatorPayout(
  creatorId: string,
  campaignId: string,
  fields: {
    payoutInvoiceRaised?: boolean;
    payoutInvoiceReceived?: boolean;
    payoutPaymentStatus?: string;
    payoutAdvance?: string | null;
    payoutRemark?: string | null;
  }
) {
  const user = await requireUser();
  if (!canSeeInternalCost(user.role)) throw new Error("Not authorized to edit creator payouts.");
  if (
    fields.payoutPaymentStatus != null &&
    !(PAYOUT_PAYMENT_STATUSES as readonly string[]).includes(fields.payoutPaymentStatus)
  ) {
    throw new Error("Invalid payment status.");
  }

  await prisma.creator.update({ where: { id: creatorId }, data: fields });

  await logActivity({
    campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "CREATOR_PAYOUT_UPDATED",
    entityType: "Creator",
    entityId: creatorId,
    meta: fields,
  });

  revalidatePath("/finance");
  revalidatePath("/dashboard");
}

// Finance & Invoicing — Client side (section B). Deliberately just a
// boolean toggle, distinct from the richer financeClientInvoiceStatus used
// by the Finance Table — see the schema comment on financeInvoiced.
export async function updateCampaignInvoiced(campaignId: string, invoiced: boolean) {
  const user = await requireUser();
  if (!canSeeInternalCost(user.role)) throw new Error("Not authorized to edit invoicing status.");

  await prisma.campaign.update({ where: { id: campaignId }, data: { financeInvoiced: invoiced } });

  await logActivity({
    campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "CAMPAIGN_INVOICED_UPDATED",
    entityType: "Campaign",
    entityId: campaignId,
    meta: { invoiced },
  });

  revalidatePath("/finance");
  revalidatePath("/dashboard");
}

export async function advanceCampaignStage(campaignId: string, stage: Stage) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot change campaign stage");

  await prisma.campaign.update({ where: { id: campaignId }, data: { stage } });
  await logActivity({
    campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "STAGE_CHANGED",
    entityType: "Campaign",
    entityId: campaignId,
    meta: { stage },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

// Both TBM team members and existing client contacts can invite another
// client contact onto a campaign (self-service on the client side, so a
// client doesn't have to go through TBM to loop in a colleague). Removing
// access, below, stays TBM-only.
export async function grantClientAccess(campaignId: string, clientEmail: string) {
  await requireUser();

  const client = await prisma.client.findUnique({ where: { email: clientEmail.toLowerCase() } });
  if (!client) {
    throw new Error("No client login found with that email. Create it first on the Team page.");
  }
  await prisma.campaignClientAccess.upsert({
    where: { campaignId_clientId: { campaignId, clientId: client.id } },
    update: {},
    create: { campaignId, clientId: client.id },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function removeClientAccess(clientAccessId: string, campaignId: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot remove client access");

  await prisma.campaignClientAccess.delete({ where: { id: clientAccessId } });
  revalidatePath(`/campaigns/${campaignId}`);
}

// Assigns an internal user to a role on this campaign (Brand Solutions,
// Campaign Manager, IR Manager/Executive) — shown in the team row on the
// campaign detail page. A campaign can have more than one person per role.
export async function assignTeamMember(campaignId: string, userId: string, roleOnCampaign: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot manage the campaign team");

  await prisma.campaignTeamMember.upsert({
    where: { campaignId_userId_roleOnCampaign: { campaignId, userId, roleOnCampaign } },
    update: {},
    create: { campaignId, userId, roleOnCampaign },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function removeTeamMember(teamMemberId: string, campaignId: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot manage the campaign team");

  await prisma.campaignTeamMember.delete({ where: { id: teamMemberId } });
  revalidatePath(`/campaigns/${campaignId}`);
}

// ---------- Creator / Shortlist ----------

export async function addCreator(campaignId: string, formData: FormData) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot add creators");

  const name = String(formData.get("name") ?? "").trim();
  const channelHandle = String(formData.get("channelHandle") ?? "").trim();
  const profileUrl = String(formData.get("profileUrl") ?? "").trim() || null;
  const youtubeUrl = String(formData.get("youtubeUrl") ?? "").trim() || null;
  const platformPrimary = String(formData.get("platformPrimary") ?? "YOUTUBE_LONG");
  const followers = Number(formData.get("followers") ?? 0) || null;
  const avgViews = Number(formData.get("avgViews") ?? 0) || null;
  const engagementRate = Number(formData.get("engagementRate") ?? 0) || null;
  const internalCost = Number(formData.get("internalCost") ?? 0) || null;
  const quotedCost = Number(formData.get("quotedCost") ?? 0) || null;
  // Carried over from lookupYoutubeChannelAction's paste-URL auto-fill (see
  // hidden inputs on the form) — same pattern as the Instagram fields above.
  const youtubeSubscribers = Number(formData.get("youtubeSubscribers") ?? 0) || null;
  const youtubeLongMedianViews = Number(formData.get("youtubeLongMedianViews") ?? 0) || null;
  const youtubeLongMedianERPercent = Number(formData.get("youtubeLongMedianERPercent") ?? 0) || null;
  const youtubeShortsMedianViews = Number(formData.get("youtubeShortsMedianViews") ?? 0) || null;
  const youtubeShortsMedianERPercent = Number(formData.get("youtubeShortsMedianERPercent") ?? 0) || null;
  if (!name || !channelHandle) throw new Error("Name and handle are required");

  // Which deliverable types this creator is being pitched for — one
  // ShortlistDeliverable row gets created per selection (checkbox group on
  // the Add Influencer form, name="deliverables").
  const deliverableTypes = formData
    .getAll("deliverables")
    .map((v) => String(v))
    .filter((v): v is ShortlistDeliverableType => (SHORTLIST_DELIVERABLE_TYPES as readonly string[]).includes(v));

  // Followers/engagementRate can arrive pre-filled from lookupInstagramProfileAction
  // (paste-URL auto-fill in the shortlist form) — see src/lib/instagram.ts.
  // One shared set of numbers per creator; shortlistDeliverables below is
  // just which deliverable types they're being pitched for (tags), not
  // separate rows with their own numbers.
  const creator = await prisma.creator.create({
    data: {
      campaignId,
      name,
      channelHandle,
      profileUrl,
      youtubeUrl,
      platformPrimary,
      followers,
      avgViews,
      engagementRate,
      youtubeSubscribers,
      youtubeLongMedianViews,
      youtubeLongMedianERPercent,
      youtubeShortsMedianViews,
      youtubeShortsMedianERPercent,
      internalCost,
      quotedCost,
      shortlistDeliverables: {
        create: deliverableTypes.map((type) => ({ deliverableType: type })),
      },
    },
  });

  await logActivity({
    campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "CREATOR_ADDED",
    entityType: "Creator",
    entityId: creator.id,
    meta: { name, deliverableTypes },
  });

  revalidatePath(`/campaigns/${campaignId}`);
}

// ---------- Shortlist pitch/negotiation (pre-onboarding) ----------

// IR-team-editable shared fields on the creator's shortlist row — everything
// except the client's own decision fields (clientIntent/clientCounterCost/
// clientRemark/clientFinalIntent, see setCreatorClientDecision below).
export async function updateCreatorShortlist(
  creatorId: string,
  fields: Partial<{
    followers: number | null;
    avgViews: number | null;
    engagementRate: number | null;
    youtubeSubscribers: number | null;
    youtubeLongMedianViews: number | null;
    youtubeLongMedianERPercent: number | null;
    youtubeShortsMedianViews: number | null;
    youtubeShortsMedianERPercent: number | null;
    insightsLinks: string[];
    internalCost: number | null;
    quotedCost: number | null;
    finalQuotedCost: number | null;
    rightsOfUsage: boolean;
    usageDurationDays: number | null;
  }>
) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot edit shortlist details");

  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { campaignId: true } });
  if (!creator) throw new Error("Creator not found");

  const { insightsLinks, ...rest } = fields;
  await prisma.creator.update({
    where: { id: creatorId },
    data: {
      ...rest,
      ...(insightsLinks ? { insightsLinks: JSON.stringify(insightsLinks.filter(Boolean).slice(0, 4)) } : {}),
    },
  });

  revalidatePath(`/campaigns/${creator.campaignId}`);
}

// Adds/removes which deliverable types a creator is tagged for (e.g. IR
// pitches an extra platform after the initial shortlist).
export async function addShortlistDeliverable(creatorId: string, deliverableType: ShortlistDeliverableType) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot add deliverables");

  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { campaignId: true } });
  if (!creator) throw new Error("Creator not found");

  await prisma.shortlistDeliverable.create({ data: { creatorId, deliverableType } });
  revalidatePath(`/campaigns/${creator.campaignId}`);
}

export async function deleteShortlistDeliverable(id: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot delete deliverables");

  const line = await prisma.shortlistDeliverable.findUnique({ where: { id }, select: { creator: { select: { campaignId: true } } } });
  if (!line) throw new Error("Shortlist deliverable not found");

  await prisma.shortlistDeliverable.delete({ where: { id } });
  revalidatePath(`/campaigns/${line.creator.campaignId}`);
}

// Client-only decision fields. Selecting ONBOARD on either clientIntent or
// clientFinalIntent promotes the whole creator to Onboarding (matches the
// brief: "if they click onboard then the profile moves to Onboarded
// section") and — the first time that happens — creates one real Deliverable
// per tagged deliverable type, so execution tracking (script/content/live
// link) picks up seamlessly from here.
export async function setCreatorClientDecision(
  creatorId: string,
  fields: Partial<{
    clientIntent: string | null;
    clientCounterCost: number | null;
    clientRemark: string | null;
    clientFinalIntent: string | null;
  }>
) {
  const user = await requireUser();
  if (!isClient(user.role)) throw new Error("Only the client can set these fields");

  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, include: { shortlistDeliverables: true } });
  if (!creator) throw new Error("Creator not found");

  // Onboarding only fires off the FINAL decision, not the early "Client's
  // Intent" read — that field is just a temperature check during
  // negotiation. The client can only lock in ONBOARD on Client's Final
  // Intent once TBM has actually set a Final Quoted Cost; otherwise a
  // client could jump straight from "Interested" to onboarded before
  // commercials are even settled.
  if ((fields.clientIntent === "ONBOARD" || fields.clientFinalIntent === "ONBOARD") && creator.finalQuotedCost === null) {
    throw new Error("Final costing hasn't been set yet — ask TBM to lock in the Final Quoted Cost before onboarding this creator.");
  }

  await prisma.creator.update({ where: { id: creatorId }, data: fields });

  const wantsOnboard = fields.clientIntent === "ONBOARD" || fields.clientFinalIntent === "ONBOARD";
  const wantsReject = fields.clientIntent === "REJECTED" || fields.clientFinalIntent === "REJECTED";

  if (wantsOnboard && creator.status !== "ONBOARDED") {
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: creator.campaignId } });
    const defaultDeadline = new Date(Date.now() + campaign.slaOnboardToGoLiveDays * 24 * 60 * 60 * 1000);
    await prisma.creator.update({
      where: { id: creatorId },
      data: { status: "ONBOARDED", onboardedAt: new Date(), commercialsLocked: true, goLiveDeadline: defaultDeadline },
    });
  } else if (wantsReject && creator.status !== "ONBOARDED") {
    await prisma.creator.update({ where: { id: creatorId }, data: { status: "CLIENT_REJECTED" } });
  }

  if (wantsOnboard) {
    for (const line of creator.shortlistDeliverables) {
      if (line.executionDeliverableId) continue;
      const type = line.deliverableType as ShortlistDeliverableType;
      const deliverable = await prisma.deliverable.create({
        data: {
          creatorId,
          platform: SHORTLIST_TO_EXECUTION_PLATFORM[type] ?? "INSTAGRAM_REEL",
          title: SHORTLIST_DELIVERABLE_LABELS[type] ?? line.deliverableType,
        },
      });
      await prisma.shortlistDeliverable.update({ where: { id: line.id }, data: { executionDeliverableId: deliverable.id } });
    }
  }

  await logActivity({
    campaignId: creator.campaignId,
    ...actorFields(user),
    actorName: user.name,
    action: "CLIENT_SHORTLIST_DECISION",
    entityType: "Creator",
    entityId: creatorId,
    meta: fields,
  });

  revalidatePath(`/campaigns/${creator.campaignId}`);
}

// Called from the "Fetch from Instagram" button in the shortlist add-form —
// paste a profile URL, get followers + engagement rate back to auto-fill the
// form. Database-only by design: this only ever reads InstagramProfileCache
// (populated by your extension → sheet → daily sync), never calls out to
// Instagram's live API. If a profile hasn't been captured yet, that's
// surfaced clearly rather than silently falling back to an external source.
// Auth-gated like every other action; not exposed to clients.
export async function lookupInstagramProfileAction(profileUrl: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot look up creators");

  const username = extractInstagramUsername(profileUrl);
  if (!username) {
    return { ok: false as const, error: "Couldn't find a username in that URL." };
  }

  const cached = await prisma.instagramProfileCache.findUnique({ where: { username } });

  if (!cached) {
    return {
      ok: false as const,
      error: `@${username} hasn't been captured yet — browse their profile with your extension, wait for the next daily sync, or add their stats manually below.`,
    };
  }

  return {
    ok: true as const,
    data: {
      username: cached.username,
      followers: cached.followers ?? 0,
      avgViews: cached.avgViews,
      engagementRate: cached.engagementRate,
      capturedAt: cached.capturedAt,
    },
  };
}

const YOUTUBE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day — stays within the free API's daily quota

// Called from the YouTube channel URL field in the shortlist add-form —
// paste a channel URL, get subscribers + median views/ER (long-form and
// Shorts split separately) to auto-fill the form. Cache-first: reuses a
// result fetched within the last day before hitting the live API, and if
// YOUTUBE_API_KEY isn't set yet, falls back to any stale cache (or a clear
// "not set up yet" message) instead of erroring the whole form.
export async function lookupYoutubeChannelAction(channelUrl: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot look up creators");

  const url = channelUrl.trim();
  if (!url) return { ok: false as const, error: "Enter a YouTube channel URL." };

  const cached = await prisma.youtubeChannelCache.findUnique({ where: { channelUrl: url } });
  const isFresh = cached && Date.now() - cached.updatedAt.getTime() < YOUTUBE_CACHE_TTL_MS;
  if (isFresh) return { ok: true as const, data: cached, stale: false };

  try {
    const stats = await fetchYoutubeChannelStats(url);
    const saved = await prisma.youtubeChannelCache.upsert({
      where: { channelUrl: url },
      create: { channelUrl: url, ...stats },
      update: { ...stats },
    });
    return { ok: true as const, data: saved, stale: false };
  } catch (err) {
    if (cached) return { ok: true as const, data: cached, stale: true };
    const message = err instanceof YoutubeLookupError ? err.message : "Couldn't fetch YouTube data.";
    return { ok: false as const, error: message };
  }
}

type CreatorRecord = Awaited<ReturnType<typeof prisma.creator.findUniqueOrThrow>>;

// Core refresh logic, shared by the manual "Refresh stats" button (one
// creator, triggered by a logged-in user) and the daily cron sweep (every
// creator, no user session). Pulls Followers/Avg Views/Engagement% from
// InstagramProfileCache (kept current by the daily sheet sync) and YouTube
// numbers from the same cache-first/24h-TTL lookup the add-form uses, then
// writes back only the fields that actually have fresher, non-null data —
// never clobbers a manually-entered value with a blank.
async function refreshCreatorStatsCore(creator: CreatorRecord) {
  const changes: { field: string; before: number | null; after: number | null }[] = [];
  const data: Record<string, number | null> = {};

  let igCapturedAt: Date | null = null;
  let igError: string | null = null;
  const igLive = false;
  // Extension/sheet cache only for now — live Graph API lookup is built
  // (see lookupInstagramProfile in lib/instagram.ts) but intentionally not
  // wired in here until Meta approves the app for that access.
  const igUsername = extractInstagramUsername(creator.channelHandle || creator.profileUrl || "");
  if (igUsername) {
    const cached = await prisma.instagramProfileCache.findUnique({ where: { username: igUsername } });
    if (cached) {
      igCapturedAt = cached.capturedAt;
      const igFields: [string, number | null, number | null][] = [
        ["followers", creator.followers, cached.followers],
        ["avgViews", creator.avgViews, cached.avgViews],
        ["engagementRate", creator.engagementRate, cached.engagementRate],
      ];
      for (const [field, before, after] of igFields) {
        if (after !== null && after !== before) changes.push({ field, before, after });
        if (after !== null) data[field] = after;
      }
    } else {
      igError = `@${igUsername} hasn't been captured by the daily sync yet.`;
    }
  }

  let ytStale = false;
  let ytError: string | null = null;
  if (creator.youtubeUrl) {
    const cached = await prisma.youtubeChannelCache.findUnique({ where: { channelUrl: creator.youtubeUrl } });
    const isFresh = cached && Date.now() - cached.updatedAt.getTime() < YOUTUBE_CACHE_TTL_MS;
    let stats = isFresh ? cached : null;
    if (!stats) {
      try {
        const fresh = await fetchYoutubeChannelStats(creator.youtubeUrl);
        stats = await prisma.youtubeChannelCache.upsert({
          where: { channelUrl: creator.youtubeUrl },
          create: { channelUrl: creator.youtubeUrl, ...fresh },
          update: { ...fresh },
        });
      } catch (err) {
        if (cached) {
          stats = cached;
          ytStale = true;
        } else {
          ytError = err instanceof YoutubeLookupError ? err.message : "Couldn't fetch YouTube data.";
        }
      }
    }
    if (stats) {
      const ytFields: [string, number | null, number | null][] = [
        ["youtubeSubscribers", creator.youtubeSubscribers, stats.subscribers],
        ["youtubeLongMedianViews", creator.youtubeLongMedianViews, stats.longMedianViews],
        ["youtubeLongMedianERPercent", creator.youtubeLongMedianERPercent, stats.longMedianERPercent],
        ["youtubeShortsMedianViews", creator.youtubeShortsMedianViews, stats.shortsMedianViews],
        ["youtubeShortsMedianERPercent", creator.youtubeShortsMedianERPercent, stats.shortsMedianERPercent],
      ];
      for (const [field, before, after] of ytFields) {
        if (after !== null && after !== before) changes.push({ field, before, after });
        if (after !== null) data[field] = after;
      }
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.creator.update({ where: { id: creator.id }, data });
  }

  return {
    changed: changes.length > 0,
    changes,
    igLive,
    igCapturedAt,
    igError,
    ytStale,
    ytError,
  };
}

// Manual, one-creator refresh — the "Refresh stats" button in the Shortlist
// table. Requires a logged-in internal user.
export async function refreshCreatorSocialStats(creatorId: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot refresh creator stats");

  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  const result = await refreshCreatorStatsCore(creator);
  if (result.changed) revalidatePath(`/campaigns/${creator.campaignId}`);
  return { ok: true as const, ...result };
}

// Bulk, every-creator refresh — called from the daily cron endpoint after
// the Google Sheet sync, so shortlisted/onboarded creators' stored numbers
// never drift far from what's actually been captured. No user session, so
// no auth check here; the cron route itself is the gate (CRON_SECRET).
export async function refreshAllCreatorsSocialStats() {
  const creators = await prisma.creator.findMany({
    where: { status: { notIn: ["REJECTED", "CLIENT_REJECTED"] } },
  });

  const campaignIdsToRevalidate = new Set<string>();
  let updated = 0;
  const failedDetails: { creatorId: string; name: string; error: string }[] = [];

  for (const creator of creators) {
    try {
      const result = await refreshCreatorStatsCore(creator);
      if (result.changed) {
        updated += 1;
        campaignIdsToRevalidate.add(creator.campaignId);
      }
    } catch (err) {
      failedDetails.push({ creatorId: creator.id, name: creator.name, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  for (const campaignId of campaignIdsToRevalidate) {
    revalidatePath(`/campaigns/${campaignId}`);
  }

  return {
    ok: true as const,
    totalCreators: creators.length,
    updated,
    failed: failedDetails.length,
    failedDetails: failedDetails.length > 0 ? failedDetails : undefined,
  };
}

export async function rejectCreator(creatorId: string, reason: string) {
  const user = await requireUser();
  const creator = await prisma.creator.update({
    where: { id: creatorId },
    data: { status: "REJECTED", rejectionReason: reason },
  });
  await logActivity({
    campaignId: creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "CREATOR_REJECTED",
    entityType: "Creator",
    entityId: creator.id,
    meta: { reason },
  });
  revalidatePath(`/campaigns/${creator.campaignId}`);
}

// Client-side action: like / shortlist / negotiate / reject with a remark.
export async function clientReviewCreator(
  creatorId: string,
  decision: "CLIENT_LIKED" | "CLIENT_NEGOTIATING" | "CLIENT_REJECTED",
  remark?: string
) {
  const user = await requireUser();
  if (!isClient(user.role)) throw new Error("Only the client can submit a review decision");

  const creator = await prisma.creator.update({ where: { id: creatorId }, data: { status: decision } });

  if (remark) {
    await prisma.remark.create({
      data: {
        campaignId: creator.campaignId,
        creatorId: creator.id,
        ...authorFields(user),
        authorRoleSnapshot: user.role,
        body: remark,
        visibility: "CLIENT",
      },
    });
  }

  await logActivity({
    campaignId: creator.campaignId,
    ...actorFields(user),
    actorName: user.name,
    action: `CLIENT_${decision}`,
    entityType: "Creator",
    entityId: creator.id,
  });

  // Instant notify: it's TBM's turn now.
  const campaign = await prisma.campaign.findUnique({ where: { id: creator.campaignId }, select: { createdById: true, name: true } });
  if (campaign) {
    await notify({
      userId: campaign.createdById,
      channel: "INSTANT",
      title: `Client responded on ${creator.name}`,
      body: `${user.name} marked ${creator.name} as ${decision.replace("CLIENT_", "").toLowerCase()} on ${campaign.name}.`,
    });
  }

  revalidatePath(`/campaigns/${creator.campaignId}`);
}

// ---------- Negotiation ----------

export async function proposeNegotiationRound(creatorId: string, proposedCost: number, note?: string) {
  const user = await requireUser();
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  const lastRound = await prisma.negotiationRound.findFirst({
    where: { creatorId },
    orderBy: { roundNumber: "desc" },
  });
  const roundNumber = (lastRound?.roundNumber ?? 0) + 1;

  await prisma.negotiationRound.create({
    data: {
      creatorId,
      roundNumber,
      proposedCost,
      proposedBy: isClient(user.role) ? "CLIENT" : user.id,
      proposedByUserId: isClient(user.role) ? undefined : user.id,
      note,
    },
  });

  // TBM proposing writes the final number to the quoted field ONLY — the
  // internal cost field is never touched by negotiation (margin guardrail,
  // brief slide 07).
  if (!isClient(user.role)) {
    await prisma.creator.update({ where: { id: creatorId }, data: { quotedCost: proposedCost, status: "CLIENT_NEGOTIATING" } });
  }

  await logActivity({
    campaignId: creator.campaignId,
    ...actorFields(user),
    actorName: user.name,
    action: "NEGOTIATION_ROUND",
    entityType: "Creator",
    entityId: creatorId,
    meta: { roundNumber, proposedCost, by: isClient(user.role) ? "CLIENT" : user.name },
  });

  revalidatePath(`/campaigns/${creator.campaignId}`);
}

// ---------- Onboarding ----------

export async function onboardCreator(creatorId: string) {
  const user = await requireUser();
  if (!isClient(user.role) && user.role !== "CAMPAIGN_MANAGER" && user.role !== "BRAND_SOLUTIONS") {
    // Either the client marks onboard, or CM/Brand Solutions can confirm it internally.
  }

  const existing = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: existing.campaignId } });
  const perCreatorDeadline = new Date(Date.now() + campaign.slaOnboardToGoLiveDays * 24 * 60 * 60 * 1000);

  const creator = await prisma.creator.update({
    where: { id: creatorId },
    data: {
      status: "ONBOARDED",
      onboardedAt: new Date(),
      commercialsLocked: true,
      goLiveDeadline: existing.goLiveDeadline ?? perCreatorDeadline,
    },
  });

  const campaignGoLiveDeadline = new Date(Date.now() + campaign.slaOnboardToGoLiveDays * 24 * 60 * 60 * 1000);
  if (!campaign.goLiveDeadline || campaignGoLiveDeadline < campaign.goLiveDeadline) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { goLiveDeadline: campaignGoLiveDeadline } });
  }

  await logActivity({
    campaignId: creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "CREATOR_ONBOARDED",
    entityType: "Creator",
    entityId: creator.id,
  });

  revalidatePath(`/campaigns/${creator.campaignId}`);
}

// POC = the IR Executive who owns every reminder/flag on this creator once
// onboarded. Internal-only; clients never assign this.
export async function assignCreatorPOC(creatorId: string, userId: string | null) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot assign a POC");

  const creator = await prisma.creator.update({ where: { id: creatorId }, data: { pocUserId: userId } });
  await logActivity({
    campaignId: creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "CREATOR_POC_ASSIGNED",
    entityType: "Creator",
    entityId: creator.id,
    meta: { pocUserId: userId },
  });
  revalidatePath(`/campaigns/${creator.campaignId}`);
}

// Go-live deadline is editable post-onboard only with a logged reason —
// the reason lives in the ActivityLog entry, not a dedicated column.
export async function updateCreatorDeadline(creatorId: string, newDeadline: string, reason: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot change the go-live deadline");
  if (!reason.trim()) throw new Error("A reason is required to change the deadline");

  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  const oldDeadline = creator.goLiveDeadline;

  await prisma.creator.update({ where: { id: creatorId }, data: { goLiveDeadline: new Date(newDeadline) } });

  await logActivity({
    campaignId: creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "CREATOR_DEADLINE_CHANGED",
    entityType: "Creator",
    entityId: creator.id,
    meta: { oldDeadline, newDeadline, reason },
  });
  revalidatePath(`/campaigns/${creator.campaignId}`);
}

// Commercial edit after lock requires a logged reason + dual approval
// (Campaign Manager + Brand Solutions) per brief slide 11.
export async function requestCommercialEdit(creatorId: string, newQuotedCost: number, reason: string) {
  const user = await requireUser();
  if (!canSetCommercials(user.role)) throw new Error("Not authorized to edit commercials");

  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  await logActivity({
    campaignId: creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "COMMERCIAL_EDIT_REQUESTED",
    entityType: "Creator",
    entityId: creator.id,
    meta: { newQuotedCost, reason, requestedBy: user.name },
  });
  // In production this should create an approval record requiring a SECOND
  // named approver (see requestCommercialEdit note in README) before writing
  // to quotedCost. MVP applies it directly if the requester already has
  // approver rights, and logs the request either way for audit.
  if (canApproveCommercialEdit(user.role)) {
    await prisma.creator.update({ where: { id: creatorId }, data: { quotedCost: newQuotedCost } });
  }
  revalidatePath(`/campaigns/${creator.campaignId}`);
}

// Same dual-approval pattern as requestCommercialEdit, but for the FINAL
// closed cost once a creator is onboarded and commercials are locked — this
// is the client-facing number shown on the Onboarding page.
export async function requestFinalCostEdit(creatorId: string, newFinalQuotedCost: number, reason: string) {
  const user = await requireUser();
  if (!canSetCommercials(user.role)) throw new Error("Not authorized to edit commercials");
  if (!reason.trim()) throw new Error("A reason is required to change a locked final cost");

  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  await logActivity({
    campaignId: creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "FINAL_COST_EDIT_REQUESTED",
    entityType: "Creator",
    entityId: creator.id,
    meta: { newFinalQuotedCost, reason, requestedBy: user.name },
  });
  if (canApproveCommercialEdit(user.role)) {
    await prisma.creator.update({ where: { id: creatorId }, data: { finalQuotedCost: newFinalQuotedCost } });
  }
  revalidatePath(`/campaigns/${creator.campaignId}`);
}

// ---------- Deliverables / Product / Script / Content / Go-live ----------

export async function addDeliverable(creatorId: string, formData: FormData) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot add deliverables");

  const platform = String(formData.get("platform") ?? "YOUTUBE_LONG");
  const title = String(formData.get("title") ?? "").trim() || null;

  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  const deliverable = await prisma.deliverable.create({ data: { creatorId, platform, title: title ?? undefined } });

  await logActivity({
    campaignId: creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "DELIVERABLE_ADDED",
    entityType: "Deliverable",
    entityId: deliverable.id,
  });
  revalidatePath(`/campaigns/${creator.campaignId}`);
}

export async function updateDeliverableTitle(deliverableId: string, title: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot edit deliverables");

  const deliverable = await prisma.deliverable.update({
    where: { id: deliverableId },
    data: { title: title.trim() || null },
    include: { creator: true },
  });
  revalidatePath(`/campaigns/${deliverable.creator.campaignId}`);
}

export async function deleteDeliverable(deliverableId: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot delete deliverables");

  const deliverable = await prisma.deliverable.findUniqueOrThrow({ where: { id: deliverableId }, include: { creator: true } });
  await prisma.deliverable.delete({ where: { id: deliverableId } });

  await logActivity({
    campaignId: deliverable.creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "DELIVERABLE_DELETED",
    entityType: "Deliverable",
    entityId: deliverableId,
    meta: { platform: deliverable.platform, title: deliverable.title },
  });
  revalidatePath(`/campaigns/${deliverable.creator.campaignId}`);
}

export async function updateProductStatus(deliverableId: string, productStatus: string, productEta?: string) {
  const user = await requireUser();
  const deliverable = await prisma.deliverable.update({
    where: { id: deliverableId },
    data: { productStatus, productEta: productEta ? new Date(productEta) : undefined },
    include: { creator: true },
  });
  await logActivity({
    campaignId: deliverable.creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "PRODUCT_STATUS_UPDATED",
    entityType: "Deliverable",
    entityId: deliverable.id,
    meta: { productStatus },
  });
  revalidatePath(`/campaigns/${deliverable.creator.campaignId}`);
}

export async function updateScriptStatus(deliverableId: string, scriptStatus: string, scriptDocUrl?: string) {
  const user = await requireUser();
  const isApproving = scriptStatus === "APPROVED";
  const deliverable = await prisma.deliverable.update({
    where: { id: deliverableId },
    data: {
      scriptStatus,
      scriptDocUrl: scriptDocUrl || undefined,
      // Freeze a timestamped snapshot on approval — the live doc keeps
      // moving, the snapshot is the binding reference (brief slide 12).
      ...(isApproving
        ? { scriptApprovedSnapshotUrl: scriptDocUrl ?? undefined, scriptApprovedAt: new Date() }
        : {}),
    },
    include: { creator: true },
  });
  await logActivity({
    campaignId: deliverable.creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: isApproving ? "SCRIPT_APPROVED" : "SCRIPT_STATUS_UPDATED",
    entityType: "Deliverable",
    entityId: deliverable.id,
    meta: { scriptStatus },
  });
  revalidatePath(`/campaigns/${deliverable.creator.campaignId}`);
}

export async function updateContentStatus(deliverableId: string, contentStatus: string) {
  const user = await requireUser();
  const isApproving = contentStatus === "APPROVED";
  const deliverable = await prisma.deliverable.update({
    where: { id: deliverableId },
    data: {
      contentStatus,
      status: isApproving ? "CONTENT_APPROVED" : "PLANNED",
      ...(isApproving ? { contentApprovedAt: new Date() } : {}),
    },
    include: { creator: { include: { campaign: true } } },
  });

  // Client is notified only at external approval (brief slide 13).
  if (contentStatus === "EXTERNAL_APPROVAL") {
    const clientAccess = await prisma.campaignClientAccess.findFirst({ where: { campaignId: deliverable.creator.campaignId } });
    if (clientAccess) {
      await notify({
        clientId: clientAccess.clientId,
        channel: "INSTANT",
        title: `Content ready for your review`,
        body: `${deliverable.creator.name}'s content on ${deliverable.creator.campaign.name} is ready for your approval.`,
      });
    }
  }

  await logActivity({
    campaignId: deliverable.creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: isApproving ? "CONTENT_APPROVED" : "CONTENT_STATUS_UPDATED",
    entityType: "Deliverable",
    entityId: deliverable.id,
    meta: { contentStatus },
  });
  revalidatePath(`/campaigns/${deliverable.creator.campaignId}`);
}

export async function addLiveLink(deliverableId: string, liveLink: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot add live links");

  const deliverable = await prisma.deliverable.update({
    where: { id: deliverableId },
    data: { liveLink, liveDate: new Date(), status: "LIVE" },
    include: { creator: true },
  });

  // Adding a live link is the trigger for automated tracking (brief slide 14).
  // Wire the real fetch in src/lib/tracking.ts (see README) and call it here
  // or from a scheduled job keyed off deliverables with status LIVE.

  await logActivity({
    campaignId: deliverable.creator.campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "LIVE_LINK_ADDED",
    entityType: "Deliverable",
    entityId: deliverable.id,
    meta: { liveLink },
  });
  revalidatePath(`/campaigns/${deliverable.creator.campaignId}`);
}

// Manual metric refresh stub — production build should call this from a
// scheduled job per deliverable with status LIVE (see src/lib/tracking.ts).
export async function refreshDeliverableMetrics(
  deliverableId: string,
  metrics: { views: number; likes: number; comments: number; shares?: number }
) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot edit tracking metrics");

  const engagementRate =
    metrics.views > 0 ? ((metrics.likes + metrics.comments + (metrics.shares ?? 0)) / metrics.views) * 100 : null;

  const deliverable = await prisma.deliverable.update({
    where: { id: deliverableId },
    data: { ...metrics, engagementRate: engagementRate ?? undefined, lastTrackedAt: new Date(), status: "TRACKING" },
    include: { creator: true },
  });
  revalidatePath(`/campaigns/${deliverable.creator.campaignId}`);
}

// ---------- Communications ----------

export async function addRemark(
  campaignId: string,
  body: string,
  opts?: { creatorId?: string; visibility?: "INTERNAL" | "CLIENT"; mentionUserIds?: string[] }
) {
  const user = await requireUser();
  const visibility = isClient(user.role) ? "CLIENT" : opts?.visibility ?? "INTERNAL";

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true } });

  await prisma.remark.create({
    data: {
      campaignId,
      creatorId: opts?.creatorId,
      ...authorFields(user),
      authorRoleSnapshot: user.role,
      body,
      visibility,
    },
  });

  // @-mentions — instant "you were tagged" notification for whoever was
  // picked from the tag-picker while writing the remark (never yourself).
  // The picker's options can include both TBM staff and client contacts
  // (see the mentionable list built in communications/[id]/page.tsx), so
  // each tagged id has to be checked against both tables to notify the
  // right one.
  const mentionIds = Array.from(new Set(opts?.mentionUserIds ?? [])).filter((id) => id !== user.id);
  for (const mentionedId of mentionIds) {
    const notifyTitle = `${user.name} tagged you in ${campaign?.name ?? "a campaign"}`;
    const notifyBody = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    const mentionedUser = await prisma.user.findUnique({ where: { id: mentionedId }, select: { id: true } });
    if (mentionedUser) {
      await notify({ userId: mentionedUser.id, channel: "INSTANT", title: notifyTitle, body: notifyBody });
    } else {
      const mentionedClient = await prisma.client.findUnique({ where: { id: mentionedId }, select: { id: true } });
      if (mentionedClient) {
        await notify({ clientId: mentionedClient.id, channel: "INSTANT", title: notifyTitle, body: notifyBody });
      }
    }
  }

  await logActivity({
    campaignId,
    ...actorFields(user),
    actorName: user.name,
    action: "REMARK_ADDED",
    entityType: "Remark",
    entityId: campaignId,
  });

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/communications");
}

// ---------- Notifications ----------

export async function getMyNotifications() {
  const user = await requireUser();
  return prisma.notification.findMany({
    where: isClient(user.role) ? { clientId: user.id } : { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function markNotificationRead(notificationId: string) {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { id: notificationId, ...(isClient(user.role) ? { clientId: user.id } : { userId: user.id }) },
    data: { read: true },
  });
  revalidatePath("/");
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { read: false, ...(isClient(user.role) ? { clientId: user.id } : { userId: user.id }) },
    data: { read: true },
  });
  revalidatePath("/");
}

// ---------- Creator Intelligence / Scouting ----------
// Discovery source is intentionally abstracted: src/lib/scouting.ts documents
// how to wire an official API or approved data provider. Nothing here scrapes
// or automates against a platform's terms.

export async function addScoutedCreator(formData: FormData) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot use the scouting queue");

  const name = String(formData.get("name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim();
  const platform = String(formData.get("platform") ?? "INSTAGRAM_REEL");
  const followers = Number(formData.get("followers") ?? 0) || null;
  const avgViews = Number(formData.get("avgViews") ?? 0) || null;
  const manualNiche = String(formData.get("niche") ?? "").trim() || null;
  if (!name || !handle) throw new Error("Name and handle required");
  if (followers === null || followers < MIN_SCOUTING_FOLLOWERS) {
    throw new Error(`Followers/subscribers must be at least ${MIN_SCOUTING_FOLLOWERS} to add a creator to the scouting queue.`);
  }

  // Duplicate check now backed by a real unique constraint on
  // handleLower (see schema.prisma) instead of loading every row into JS
  // and scanning — this findUnique is just for a friendly error message
  // naming the existing creator; the constraint itself (caught below) is
  // what actually guarantees no duplicate ever gets in, even under a race.
  const handleLower = handle.toLowerCase();
  const existing = await prisma.scoutedCreator.findUnique({ where: { handleLower }, select: { name: true } });
  if (existing) {
    throw new Error(`${existing.name} (${handle}) is already in the scouting queue.`);
  }

  // For YouTube creators, niche is auto-detected from the channel's own
  // YouTube-assigned topics (topicDetails.topicCategories) instead of
  // relying on manual entry — this runs silently in the background and
  // never blocks creator creation if the lookup fails or isn't configured.
  let niche = manualNiche;
  let instagramHandle: string | null = null;
  if (platform === "YOUTUBE_LONG" || platform === "YOUTUBE_SHORTS") {
    try {
      const detected = await fetchYoutubeChannelNiche(handle);
      if (detected) niche = detected;
    } catch {
      // Swallow — auto-detection is best-effort, falls back to manual/null.
    }
    try {
      instagramHandle = await fetchYoutubeChannelInstagramHandle(handle);
    } catch {
      // Swallow — same as above, this is a bonus find, not a requirement.
    }
  }

  const engagementRate = followers && avgViews ? Math.min(100, (avgViews / followers) * 10) : null;
  const score = scoreCreator({ followers, avgViews, engagementRate });

  try {
    await prisma.scoutedCreator.create({
      data: { name, handle, handleLower, platform, followers, avgViews, engagementRate, niche, instagramHandle, score, source: "MANUAL_IMPORT" },
    });
  } catch (err) {
    // Backstop for the race the findUnique check above can't fully close
    // (two submits landing at the same instant) — the constraint is what
    // actually enforces this, this just turns the raw DB error into the
    // same friendly message as the pre-check.
    if (isUniqueConstraintError(err)) {
      throw new Error(`A creator with the handle "${handle}" is already in the scouting queue.`);
    }
    throw err;
  }
  if (instagramHandle) await appendInstagramHandleToSheet(instagramHandle).catch(() => false);
  revalidatePath("/creators");
}

// On-demand YouTube search from the scouting page itself, as opposed to the
// automatic per-campaign discovery job. Lets someone type a topic plus an
// optional Indian city/state ("Mumbai", "Tier-2", etc.) to search for right
// now, instead of waiting for the scheduled job to get to it. Same
// India-only filtering and duplicate-skipping as the automatic job.
export async function searchYoutubeCreatorsManually(formData: FormData) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Clients cannot use the scouting queue");

  const topic = String(formData.get("searchQuery") ?? "").trim();
  const location = String(formData.get("searchLocation") ?? "").trim();
  if (!topic) throw new Error("Enter something to search for.");

  const query = location ? `${topic} ${location}` : topic;
  const hits = await searchYoutubeChannels(query, 25, { regionCode: "IN" });

  let added = 0;
  let skippedBelowThreshold = 0;
  const skipped: string[] = [];

  for (const hit of hits) {
    if (!hit.handle) continue;
    if (isLikelyIndianChannel(hit.country) === "no") {
      skipped.push(`${hit.title} (not India-based)`);
      continue;
    }

    const handleLower = hit.handle.toLowerCase();
    const existing = await prisma.scoutedCreator.findUnique({ where: { handleLower } });
    if (existing) continue;

    try {
      const [stats, niche, instagramHandle] = await Promise.all([
        fetchYoutubeChannelStats(hit.handle),
        fetchYoutubeChannelNiche(hit.handle).catch(() => null),
        fetchYoutubeChannelInstagramHandle(hit.handle).catch(() => null),
      ]);

      if (stats.subscribers === null || stats.subscribers < MIN_SCOUTING_FOLLOWERS) {
        skippedBelowThreshold++;
        continue;
      }

      const avgViews = stats.longMedianViews ?? stats.shortsMedianViews;
      const engagementRate = stats.longMedianERPercent ?? stats.shortsMedianERPercent;
      const platform = stats.longMedianViews !== null ? "YOUTUBE_LONG" : "YOUTUBE_SHORTS";
      const score = scoreCreator({ followers: stats.subscribers, avgViews, engagementRate });

      await prisma.scoutedCreator.create({
        data: {
          name: hit.title,
          handle: hit.handle,
          handleLower,
          platform,
          followers: stats.subscribers,
          avgViews,
          engagementRate,
          niche,
          instagramHandle,
          score,
          source: "MANUAL_SEARCH_YOUTUBE",
        },
      });
      added++;
      if (instagramHandle) await appendInstagramHandleToSheet(instagramHandle).catch(() => false);
    } catch {
      // Best-effort — one bad lookup shouldn't stop the rest of the batch.
      // Also silently absorbs the rare case where the handleLower unique
      // constraint rejects this insert as a duplicate (e.g. two overlapping
      // searches racing each other) — correct behavior is just "don't add
      // it twice," no error needed.
    }
  }

  revalidatePath("/creators");
  return { added, found: hits.length, skippedNotIndia: skipped.length, skippedBelowThreshold };
}

// Simple transparent scoring function — swap for real criteria weighting once
// campaign-specific requirements (niche match, budget fit, audience overlap)
// are defined. Kept deterministic and inspectable on purpose.
function scoreCreator(input: { followers: number | null; avgViews: number | null; engagementRate: number | null }) {
  const reachScore = input.avgViews ? Math.min(50, Math.log10(input.avgViews + 1) * 10) : 0;
  const engagementScore = input.engagementRate ? Math.min(50, input.engagementRate * 6) : 0;
  return Math.round(reachScore + engagementScore);
}

// One-off cleanup for the duplicate rows that got in before addScoutedCreator
// had a duplicate check (see that function's comment). Keeps the oldest row
// for each handle (first one added) and deletes any later duplicates.
// Called from a one-time cron-style route, not exposed as a UI button —
// once the existing duplicates are gone, the new check in addScoutedCreator
// prevents this from happening again.
export async function dedupeScoutedCreators(): Promise<{ deleted: number; kept: string[] }> {
  const all = await prisma.scoutedCreator.findMany({ orderBy: { createdAt: "asc" } });
  const seen = new Map<string, string>(); // lowercase handle -> id of the row we're keeping
  const toDelete: string[] = [];

  for (const c of all) {
    const key = c.handle.toLowerCase();
    if (seen.has(key)) {
      toDelete.push(c.id);
    } else {
      seen.set(key, c.id);
    }
  }

  if (toDelete.length > 0) {
    await prisma.scoutedCreator.deleteMany({ where: { id: { in: toDelete } } });
    revalidatePath("/creators");
  }

  return { deleted: toDelete.length, kept: Array.from(seen.values()) };
}

// One-off backfill for ScoutedCreator rows added before handleLower existed
// (its @unique constraint is what now actually prevents duplicates — see
// schema.prisma). Run dedupeScoutedCreators first: if two existing rows are
// already same-handle duplicates in different cases ("GlamNGo" / "glamngo"),
// backfilling both would collide with the same constraint this is trying to
// retrofit. Any row that still collides (dedupe wasn't run, or a genuine
// leftover) is reported in `conflicts` rather than aborting the batch.
export async function backfillScoutedHandleLower(): Promise<{ updated: number; conflicts: string[] }> {
  const rows = await prisma.scoutedCreator.findMany({ where: { handleLower: null }, orderBy: { createdAt: "asc" } });

  let updated = 0;
  const conflicts: string[] = [];

  for (const row of rows) {
    const handleLower = row.handle.toLowerCase();
    try {
      await prisma.scoutedCreator.update({ where: { id: row.id }, data: { handleLower } });
      updated++;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        conflicts.push(`${row.name} (${row.handle})`);
        continue;
      }
      throw err;
    }
  }

  if (updated > 0) revalidatePath("/creators");
  return { updated, conflicts };
}

// One-off backfill for YouTube rows scouted before avgViews/engagementRate
// were calculated (that calculation — median views/ER from recent videos —
// was added after some rows already existed, so those older rows are stuck
// at NULL forever unless something re-fetches them). Re-runs
// fetchYoutubeChannelStats for every YouTube ScoutedCreator row still
// missing either number, updates followers/avgViews/engagementRate/score,
// and moves on if a single channel fails to resolve (deleted/renamed
// channel, API hiccup) rather than aborting the whole batch. Called from a
// one-time cron-style route, same as dedupeScoutedCreators above — safe to
// re-run, it just becomes a no-op once nothing is left to backfill.
export async function backfillYoutubeCreatorStats(): Promise<{
  updated: number;
  skipped: number;
  failed: { handle: string; error: string }[];
}> {
  const rows = await prisma.scoutedCreator.findMany({
    where: {
      platform: { in: ["YOUTUBE_LONG", "YOUTUBE_SHORTS"] },
      OR: [{ avgViews: null }, { engagementRate: null }],
    },
  });

  let updated = 0;
  let skipped = 0;
  const failed: { handle: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const stats = await fetchYoutubeChannelStats(row.handle);
      const avgViews = stats.longMedianViews ?? stats.shortsMedianViews;
      const engagementRate = stats.longMedianERPercent ?? stats.shortsMedianERPercent;

      if (avgViews === null && engagementRate === null) {
        // Channel still has no usable recent videos — nothing new to save.
        skipped++;
        continue;
      }

      const platform = stats.longMedianViews !== null ? "YOUTUBE_LONG" : row.platform;
      const score = scoreCreator({ followers: stats.subscribers ?? row.followers, avgViews, engagementRate });

      await prisma.scoutedCreator.update({
        where: { id: row.id },
        data: {
          followers: stats.subscribers ?? row.followers,
          avgViews,
          engagementRate,
          platform,
          score,
        },
      });
      updated++;
    } catch (err) {
      failed.push({ handle: row.handle, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  if (updated > 0) revalidatePath("/creators");

  return { updated, skipped, failed };
}

export async function qualifyScoutedCreator(id: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Not authorized");
  await prisma.scoutedCreator.update({ where: { id }, data: { status: "QUALIFIED" } });
  revalidatePath("/creators");
}

export async function rejectScoutedCreator(id: string, notes?: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Not authorized");
  await prisma.scoutedCreator.update({ where: { id }, data: { status: "REJECTED", notes } });
  revalidatePath("/creators");
}

// Turns whatever a scouted creator's handle looks like (a bare "@handle", a
// raw channel/profile URL someone pasted in manually, or a plain username)
// into a real clickable link for the platform it was scouted on — so the
// Shortlist's Socials column shows a working link the moment a creator is
// promoted, instead of bare text until someone clicks "Refresh stats".
function deriveSocialUrls(platform: string, handle: string): { profileUrl: string | null; youtubeUrl: string | null } {
  const trimmed = handle.trim();
  if (!trimmed) return { profileUrl: null, youtubeUrl: null };

  const isYoutube = platform === "YOUTUBE_LONG" || platform === "YOUTUBE_SHORTS";
  const alreadyUrl = /^https?:\/\//i.test(trimmed);

  if (isYoutube) {
    const youtubeUrl = alreadyUrl ? trimmed : `https://www.youtube.com/${trimmed.startsWith("@") ? trimmed : `@${trimmed}`}`;
    return { profileUrl: null, youtubeUrl };
  }

  // Instagram (or anything else that isn't YouTube)
  const username = trimmed.replace(/^@/, "");
  const profileUrl = alreadyUrl ? trimmed : `https://www.instagram.com/${username}/`;
  return { profileUrl, youtubeUrl: null };
}

// Promotes a scouted creator straight into a campaign's shortlist —
// the hand-off point into the same Campaign Management Panel pipeline
// described in the outreach workflow.
export async function promoteScoutedCreatorToCampaign(scoutedId: string, campaignId: string) {
  const user = await requireUser();
  if (isClient(user.role)) throw new Error("Not authorized");

  const scouted = await prisma.scoutedCreator.findUniqueOrThrow({ where: { id: scoutedId } });
  const { profileUrl: guessedProfileUrl, youtubeUrl: guessedYoutubeUrl } = deriveSocialUrls(scouted.platform, scouted.handle);
  const isYoutube = scouted.platform === "YOUTUBE_LONG" || scouted.platform === "YOUTUBE_SHORTS";

  // For a YouTube-primary creator, deriveSocialUrls never sets profileUrl
  // (it's built for exactly one platform's link). But if an Instagram
  // handle was detected in their YouTube description during scouting, that
  // becomes the profileUrl here — carrying it forward so the Shortlist's
  // Socials cell can show a real "Instagram" link next to their YouTube one.
  const profileUrl = isYoutube
    ? (scouted.instagramHandle ? `https://www.instagram.com/${scouted.instagramHandle}/` : null)
    : guessedProfileUrl;

  // For YouTube, don't just trust a guessed URL built from the handle text —
  // verify the channel actually exists via the API and use its real
  // canonical /channel/UC... link, which always redirects correctly. Only
  // fall back to the guessed @handle URL if verification isn't possible
  // (API not configured, quota hit, or the channel genuinely can't be found).
  const youtubeUrl = isYoutube ? (await resolveYoutubeChannelCanonicalUrl(scouted.handle)) ?? guessedYoutubeUrl : null;

  const creator = await prisma.creator.create({
    data: {
      campaignId,
      name: scouted.name,
      channelHandle: scouted.handle,
      platformPrimary: scouted.platform,
      profileUrl,
      youtubeUrl,
      followers: isYoutube ? null : scouted.followers,
      avgViews: isYoutube ? null : scouted.avgViews,
      engagementRate: isYoutube ? null : scouted.engagementRate,
      youtubeSubscribers: isYoutube ? scouted.followers : null,
      youtubeLongMedianViews: isYoutube && scouted.platform === "YOUTUBE_LONG" ? scouted.avgViews : null,
      youtubeLongMedianERPercent: isYoutube && scouted.platform === "YOUTUBE_LONG" ? scouted.engagementRate : null,
      youtubeShortsMedianViews: isYoutube && scouted.platform === "YOUTUBE_SHORTS" ? scouted.avgViews : null,
      youtubeShortsMedianERPercent: isYoutube && scouted.platform === "YOUTUBE_SHORTS" ? scouted.engagementRate : null,
      category: scouted.niche,
    },
  });
  await prisma.scoutedCreator.update({ where: { id: scoutedId }, data: { status: "PROMOTED", promotedToCreatorId: creator.id } });

  await logActivity({
    campaignId,
    actorId: user.id,
    actorName: user.name,
    action: "SCOUTED_CREATOR_PROMOTED",
    entityType: "Creator",
    entityId: creator.id,
    meta: { fromScoutedId: scoutedId },
  });

  revalidatePath("/creators");
  revalidatePath(`/campaigns/${campaignId}`);
}

// ---------- Team management (CXO only) ----------
// The only place a real login gets created outside prisma/seed.ts. Internal
// roles sign in via Google (restricted to @theboredmonkey.com in
// src/lib/auth.ts) so they never need a usable password — one is still
// generated and hashed to satisfy the schema's required passwordHash
// column, it's just never checked for internal accounts. Clients are a
// separate table entirely (see the Client model) — they don't have a
// company Google account, so their password is real and chosen here, and
// they're managed via the createClientAccount/updateClientAccount/
// deleteClientAccount actions below instead of these.

const INTERNAL_EMAIL_DOMAIN = "theboredmonkey.com";

export async function createTeamUser(input: { name: string; email: string; role: string }) {
  const actor = await requireUser();
  if (!canManageTeam(actor.role)) throw new Error("Only a CXO can add team members.");

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const role = input.role as Role;

  if (!name) throw new Error("Name is required.");
  if (!email) throw new Error("Email is required.");
  if (!INTERNAL_ROLES.includes(role as Exclude<Role, "CLIENT">)) throw new Error("Invalid role.");

  if (!email.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`)) {
    // Matches the domain check in src/lib/auth.ts's Google signIn callback
    // — an internal account with a non-company email could never actually
    // sign in, so refuse to create one rather than create a dead account.
    throw new Error(`Internal accounts need a @${INTERNAL_EMAIL_DOMAIN} email — that's what Google sign-in checks against.`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("A user with that email already exists.");

  const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);

  try {
    await prisma.user.create({ data: { name, email, role, passwordHash } });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new Error("A user with that email already exists.");
    throw err;
  }

  revalidatePath("/team");
}

export async function updateTeamUserRole(userId: string, role: string) {
  const actor = await requireUser();
  if (!canManageTeam(actor.role)) throw new Error("Only a CXO can change a team member's role.");
  if (!INTERNAL_ROLES.includes(role as Exclude<Role, "CLIENT">)) throw new Error("Invalid role.");
  if (userId === actor.id && role !== "CXO") {
    throw new Error("You can't demote your own account — have another CXO do it.");
  }

  await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/team");
}

export async function deleteTeamUser(userId: string) {
  const actor = await requireUser();
  if (!canManageTeam(actor.role)) throw new Error("Only a CXO can remove a team member.");
  if (userId === actor.id) throw new Error("You can't remove your own account.");

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    // Restrict onDelete on createdCampaigns/remarks/activity (schema.prisma)
    // — deliberately blocks deleting someone who created real business
    // records or audit history, rather than silently orphaning them.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2003") {
      throw new Error(
        "This person has created campaigns, remarks, or activity history — they can't be deleted. Change their role instead, or remove them from campaign teams first."
      );
    }
    throw err;
  }
  revalidatePath("/team");
}

// ---------- Client accounts (CXO only) ----------
// Clients live in their own table (Client), not User — see schema.prisma's
// comment on that model. Same admin gate (canManageTeam, CXO-only) as
// internal team management above, just a different table and no role field
// (there's only one kind of client account).

export async function createClientAccount(input: { name: string; email: string; password: string }) {
  const actor = await requireUser();
  if (!canManageTeam(actor.role)) throw new Error("Only a CXO can add clients.");

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) throw new Error("Name is required.");
  if (!email) throw new Error("Email is required.");
  if (!input.password || input.password.length < 8) {
    throw new Error("Clients need a password of at least 8 characters — they log in with it directly.");
  }

  const existing = await prisma.client.findUnique({ where: { email } });
  if (existing) throw new Error("A client with that email already exists.");

  const passwordHash = await bcrypt.hash(input.password, 10);

  try {
    await prisma.client.create({ data: { name, email, passwordHash } });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new Error("A client with that email already exists.");
    throw err;
  }

  revalidatePath("/team");
}

export async function updateClientAccount(clientId: string, input: { name?: string; password?: string }) {
  const actor = await requireUser();
  if (!canManageTeam(actor.role)) throw new Error("Only a CXO can edit a client.");

  const data: { name?: string; passwordHash?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Name is required.");
    data.name = name;
  }
  if (input.password) {
    if (input.password.length < 8) throw new Error("Password needs to be at least 8 characters.");
    data.passwordHash = await bcrypt.hash(input.password, 10);
  }

  await prisma.client.update({ where: { id: clientId }, data });
  revalidatePath("/team");
}

export async function deleteClientAccount(clientId: string) {
  const actor = await requireUser();
  if (!canManageTeam(actor.role)) throw new Error("Only a CXO can remove a client.");

  try {
    await prisma.client.delete({ where: { id: clientId } });
  } catch (err) {
    // Same Restrict-onDelete reasoning as deleteTeamUser above — a client
    // who's posted remarks or logged activity can't be silently deleted.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2003") {
      throw new Error(
        "This client has posted remarks or has activity history — they can't be deleted. Remove them from campaign access instead."
      );
    }
    throw err;
  }
  revalidatePath("/team");
}
