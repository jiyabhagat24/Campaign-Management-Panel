import { COMMERCIAL_APPROVER_ROLES, INTERNAL_COST_ROLES, type Role } from "@/lib/constants";

export function isClient(role: Role) {
  return role === "CLIENT";
}

export function isInternal(role: Role) {
  return !isClient(role);
}

export function canSeeInternalCost(role: Role) {
  return INTERNAL_COST_ROLES.includes(role);
}

export function canApproveCommercialEdit(role: Role) {
  return COMMERCIAL_APPROVER_ROLES.includes(role);
}

export function canEditShortlistAndStatus(role: Role) {
  return role !== "CLIENT";
}

export function canSetCommercials(role: Role) {
  return role === "CXO" || role === "BRAND_SOLUTIONS" || role === "CAMPAIGN_MANAGER" || role === "IR_MANAGER";
}

// IR Intern: works shortlisting/onboarding rows like an IR Executive, and
// sees full cost/margin same as everyone internal, but never approves or
// sets commercials.
export function isIntern(role: Role) {
  return role === "IR_INTERN";
}

// CXO is the only org-wide, unscoped role — everyone else, no exceptions,
// only sees the campaigns they're personally assigned to (a
// CampaignTeamMember row): the 3 Brand Solutions people see only the
// brands/campaigns they personally talk to, the 3 Campaign Managers see
// only the campaigns they personally run, and within the IR team the IR
// Manager, IR Executives, and IR Interns each only see the campaigns
// they're personally on — an IR Manager does not automatically see every
// campaign their reports are working on. Matches a client only seeing
// campaigns they have clientAccess to.
export function isOrgWide(role: Role) {
  return role === "CXO";
}

// Prisma `where` fragment for "which campaigns can this user see": clients
// scoped to clientAccess, CXO unscoped (sees everything), every other role
// scoped to campaigns they're a team member on. Spread this into any
// Campaign.findMany/findFirst where clause.
export function campaignVisibilityWhere(user: { id: string; role: Role }) {
  if (isClient(user.role)) return { clientAccess: { some: { userId: user.id } } };
  if (isOrgWide(user.role)) return {};
  return { teamMembers: { some: { userId: user.id } } };
}

// Same scope, applied to an already-fetched campaign (its teamMembers/
// clientAccess must be included) — used where a single campaign is fetched
// by id and we need a not-found-style access check rather than a query filter.
export function canViewCampaign(
  user: { id: string; role: Role },
  campaign: { teamMembers: { userId: string }[]; clientAccess: { userId: string }[] }
) {
  if (isClient(user.role)) return campaign.clientAccess.some((a) => a.userId === user.id);
  if (isOrgWide(user.role)) return true;
  return campaign.teamMembers.some((t) => t.userId === user.id);
}

// The margin guardrail (brief slide 07): strip internal cost + rejection
// reasons meant for internal eyes before anything reaches a client-facing
// render, export, or email. Call this at the boundary, not ad hoc in the UI.
export function serializeCreatorForClient<T extends { internalCost: number | null }>(
  creator: T
): Omit<T, "internalCost"> {
  const { internalCost, ...rest } = creator;
  return rest;
}

export function serializeCreatorsForClient<T extends { internalCost: number | null }>(
  creators: T[]
): Omit<T, "internalCost">[] {
  return creators.map(serializeCreatorForClient);
}
