// Central vocabulary for the panel. Kept as plain strings (not DB enums) so the
// same schema works unmodified on SQLite (local/demo) and Postgres (production) —
// only DATABASE_URL and the prisma provider line change between the two.

// CXO and IR_INTERN added from the team's role-based access wireframe
// (TBM_Campaign_Panel_Wireframes.html): CXO is org-wide leadership with the
// same (or broader) visibility as Brand Solutions; IR Intern is a junior
// execution role scoped to the creators they're assigned, with no cost/
// margin visibility at all — same treatment the app already gives clients,
// just for a different reason (need-to-know, not confidentiality-from-client).
export const ROLES = [
  "CXO",
  "BRAND_SOLUTIONS",
  "CAMPAIGN_MANAGER",
  "IR_MANAGER",
  "IR_EXECUTIVE",
  "IR_INTERN",
  "CLIENT",
] as const;
export type Role = (typeof ROLES)[number];

// TBM staff only — this is the set actually stored in User.role and
// validated when the Team page creates/re-roles a login. "CLIENT" stays in
// ROLES/Role above only as a virtual session tag (see rbac.ts isClient) —
// clients live in their own Client table now (no role column at all) and
// are managed through the separate createClientAccount/updateClientAccount/
// deleteClientAccount actions, not createTeamUser.
export const INTERNAL_ROLES = ROLES.filter((r) => r !== "CLIENT") as Exclude<Role, "CLIENT">[];

// Roles allowed to see internal cost / margin. Updated per the team's
// explicit call: every internal role sees everything (cost, margin,
// payouts) about the campaigns they're assigned to — CXO sees it org-wide
// with no assignment scoping at all. Only the client is excluded. Campaign
// *visibility* itself (which campaigns a non-CXO role can even open) is a
// separate scope, see campaignVisibilityWhere in rbac.ts.
export const INTERNAL_COST_ROLES: Role[] = ROLES.filter((r) => r !== "CLIENT");
export const COMMERCIAL_APPROVER_ROLES: Role[] = [
  "CXO",
  "BRAND_SOLUTIONS",
  "CAMPAIGN_MANAGER",
];

// Campaign.status vocabulary — a plain string column (see model comment),
// so no migration was needed to change this. Every campaign still defaults
// to ACTIVE at creation; changing status is a deliberate action via
// updateCampaignStatus in actions.ts, exposed as a dropdown on both the
// dashboard's Campaign Table and the Campaigns Directory's Action column.
export const CAMPAIGN_STATUSES = ["ACTIVE", "HOLD", "COMPLETED", "CANCELLED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  ACTIVE: "Active",
  HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

// Which campaign statuses count toward the money figures shown on the
// dashboard summary cards, the Finance Table, and the /finance page
// (creator payouts + client invoicing) — explicit product call: a campaign
// that's actively running or wrapped up successfully still counts, one
// that's paused or dead shouldn't inflate (or appear in) the live financial
// picture. Does NOT affect the Campaign Table/Directory list itself, which
// always shows every campaign regardless of status.
export const FINANCE_VISIBLE_STATUSES: CampaignStatus[] = ["ACTIVE", "COMPLETED"];

// "Client Invoice status" column on the Finance Table sheet tab — manual
// entry (see Campaign.financeClientInvoiceStatus), same reasoning as the
// other finance fields: no real invoicing system exists yet to compute
// this automatically.
export const INVOICE_STATUSES = ["NOT_INVOICED", "INVOICED", "PAID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  NOT_INVOICED: "Not Invoiced",
  INVOICED: "Invoiced",
  PAID: "Paid",
};

// Finance & Invoicing — Creator side payouts (section A of the sheet's
// separate spec), Creator.payoutPaymentStatus. Distinct from InvoiceStatus
// above, which tracks the client side, not what TBM owes a creator.
export const PAYOUT_PAYMENT_STATUSES = ["NOT_STARTED", "ADVANCE_PAID", "IN_PROCESS", "PAID"] as const;
export type PayoutPaymentStatus = (typeof PAYOUT_PAYMENT_STATUSES)[number];
export const PAYOUT_PAYMENT_STATUS_LABELS: Record<PayoutPaymentStatus, string> = {
  NOT_STARTED: "Not started",
  ADVANCE_PAID: "Advance paid",
  IN_PROCESS: "In process",
  PAID: "Paid",
};

export const STAGES = [
  "BRIEF",
  "SHORTLIST",
  "CLIENT_REVIEW",
  "NEGOTIATE",
  "ONBOARD",
  "PRODUCT",
  "SCRIPT",
  "CONTENT",
  "GO_LIVE",
  "TRACK",
  "REPORT",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  BRIEF: "Brief",
  SHORTLIST: "Shortlist",
  CLIENT_REVIEW: "Client Review",
  NEGOTIATE: "Negotiate",
  ONBOARD: "Onboard",
  PRODUCT: "Product",
  SCRIPT: "Script",
  CONTENT: "Content",
  GO_LIVE: "Go Live",
  TRACK: "Track",
  REPORT: "Report",
};

// Who owns the clock at each stage — drives the TAT/SLA engine (brief slide 04/15).
export const STAGE_OWNER: Record<Stage, "TBM" | "CLIENT" | "AUTO"> = {
  BRIEF: "TBM",
  SHORTLIST: "TBM",
  CLIENT_REVIEW: "CLIENT",
  NEGOTIATE: "CLIENT",
  ONBOARD: "CLIENT",
  PRODUCT: "CLIENT",
  SCRIPT: "TBM",
  CONTENT: "TBM",
  GO_LIVE: "AUTO",
  TRACK: "AUTO",
  REPORT: "AUTO",
};

export const CREATOR_STATUSES = [
  "SHORTLISTED",
  "CLIENT_LIKED",
  "CLIENT_NEGOTIATING",
  "CLIENT_REJECTED",
  "ONBOARDED",
  "REJECTED",
] as const;
export type CreatorStatus = (typeof CREATOR_STATUSES)[number];

// The 3 macro columns each campaign's board is organized into. A creator's
// fine-grained CreatorStatus maps to exactly one column; ONBOARDED creators
// always show in both Onboarding (to manage production) and Report (since
// they're what a report is generated from).
export const KANBAN_COLUMNS = ["SHORTLIST", "ONBOARDING", "REPORT"] as const;
export type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

export const KANBAN_COLUMN_LABELS: Record<KanbanColumn, string> = {
  SHORTLIST: "Shortlist",
  ONBOARDING: "Onboarding",
  REPORT: "Report",
};

export function creatorKanbanColumn(status: string): KanbanColumn {
  return status === "ONBOARDED" ? "ONBOARDING" : "SHORTLIST";
}

export const DELIVERABLE_STATUSES = [
  "PLANNED",
  "PRODUCT_ORDERED",
  "PRODUCT_IN_TRANSIT",
  "PRODUCT_DELIVERED",
  "SCRIPT_SENT",
  "SCRIPT_FEEDBACK",
  "SCRIPT_REVISED",
  "SCRIPT_APPROVED",
  "IN_SHOOT",
  "INTERNAL_APPROVAL",
  "EXTERNAL_APPROVAL",
  "CHANGES_REQUESTED",
  "CONTENT_APPROVED",
  "LIVE",
  "TRACKING",
  "COMPLETED",
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const PLATFORMS = [
  "YOUTUBE_LONG",
  "YOUTUBE_SHORTS",
  "INSTAGRAM_REEL",
  "INSTAGRAM_POST",
  "INSTAGRAM_STORY",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  YOUTUBE_LONG: "YouTube (Long form)",
  YOUTUBE_SHORTS: "YouTube Shorts",
  INSTAGRAM_REEL: "Instagram Reel",
  INSTAGRAM_POST: "Instagram Post",
  INSTAGRAM_STORY: "Instagram Story",
};

// Short codes for compact display — e.g. the Finance & Invoicing "Creator
// side payouts" table's Deliverables column, which lists each creator's
// deliverables as a comma-joined tag list ("IGR, YTD, YTS") rather than
// full platform names.
export const PLATFORM_SHORT_LABELS: Record<Platform, string> = {
  YOUTUBE_LONG: "YTD",
  YOUTUBE_SHORTS: "YTS",
  INSTAGRAM_REEL: "IGR",
  INSTAGRAM_POST: "IGP",
  INSTAGRAM_STORY: "IGS",
};

// ---------- Shortlist deliverable pitch (pre-onboarding) ----------

export const SHORTLIST_DELIVERABLE_TYPES = [
  "REEL",
  "COLLAB_REEL",
  "YT_DEDICATED",
  "YT_INTEGRATED",
  "YT_CONCEPTUAL",
  "YT_SHORTS",
] as const;
export type ShortlistDeliverableType = (typeof SHORTLIST_DELIVERABLE_TYPES)[number];

export const SHORTLIST_DELIVERABLE_LABELS: Record<ShortlistDeliverableType, string> = {
  REEL: "Reel",
  COLLAB_REEL: "Collab Reel",
  YT_DEDICATED: "YT Dedicated",
  YT_INTEGRATED: "YT Integrated",
  YT_CONCEPTUAL: "YT Conceptual",
  YT_SHORTS: "YT Shorts",
};

// Which social a deliverable type lives on — drives the Socials hyperlink
// (Instagram profile vs YouTube channel) and whether Audience Size means
// followers or subscribers.
export const SHORTLIST_DELIVERABLE_SOCIAL: Record<ShortlistDeliverableType, "INSTAGRAM" | "YOUTUBE"> = {
  REEL: "INSTAGRAM",
  COLLAB_REEL: "INSTAGRAM",
  YT_DEDICATED: "YOUTUBE",
  YT_INTEGRATED: "YOUTUBE",
  YT_CONCEPTUAL: "YOUTUBE",
  YT_SHORTS: "YOUTUBE",
};

// Maps a shortlist-stage deliverable type onto the existing execution-stage
// Deliverable.platform vocabulary — used when a shortlist row is promoted to
// a real tracked deliverable on onboarding.
export const SHORTLIST_TO_EXECUTION_PLATFORM: Record<ShortlistDeliverableType, Platform> = {
  REEL: "INSTAGRAM_REEL",
  COLLAB_REEL: "INSTAGRAM_REEL",
  YT_DEDICATED: "YOUTUBE_LONG",
  YT_INTEGRATED: "YOUTUBE_LONG",
  YT_CONCEPTUAL: "YOUTUBE_LONG",
  YT_SHORTS: "YOUTUBE_SHORTS",
};

export const CLIENT_INTENT_OPTIONS = ["PENDING", "INTERESTED", "NEGOTIATING", "ONBOARD", "REJECTED"] as const;
export type ClientIntent = (typeof CLIENT_INTENT_OPTIONS)[number];
export const CLIENT_INTENT_LABELS: Record<ClientIntent, string> = {
  PENDING: "Pending",
  INTERESTED: "Interested",
  NEGOTIATING: "Negotiating",
  ONBOARD: "Onboard",
  REJECTED: "Rejected",
};

export const SCOUT_STATUSES = [
  "NEW",
  "QUALIFIED",
  "OUTREACH_QUEUED",
  "OUTREACH_SENT",
  "RESPONDED",
  "REJECTED",
  "PROMOTED",
] as const;
export type ScoutStatus = (typeof SCOUT_STATUSES)[number];

// Minimum subscriber/follower count to enter the scouting queue at all —
// applies everywhere a creator gets added (auto-discovery, the manual
// YouTube search box, and the manual import form), so near-empty accounts
// never clutter the queue in the first place.
export const MIN_SCOUTING_FOLLOWERS = 500;

// Default SLAs (brief slide 15) — overridable per campaign.
export const DEFAULT_SLA = {
  clientFeedbackHours: 48,
  scriptFromCreatorDays: 5,
  contentFromCreatorDays: 7,
  onboardToGoLiveDays: 15,
};
