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

// Per spec Page Permissions: Shortlisting row creation/editing (adding a
// creator, its socials/deliverables/internal cost/etc.) belongs to IR
// Executive and IR Intern only — "Create and edit, own rows" / "own and
// Intern rows". Campaign Manager only vets/prices via canSetCommercials
// (their Shortlisting grant is "Vet, price and publish", not row editing).
// Brand Solutions is "View published rows only". CXO is "Not available" —
// locked out entirely, not even read access to this specific page.
export function canOperateShortlist(role: Role) {
  return role === "IR_EXECUTIVE" || role === "IR_INTERN";
}

// Campaign Manager exclusively sets/edits Campaign Commercials and Pricing —
// not CXO, Brand Solutions, or IR Manager, even though they can view it (see
// canSeeInternalCost). Narrowed from the earlier 4-role set per spec.
export function canSetCommercials(role: Role) {
  return role === "CAMPAIGN_MANAGER";
}

// IR Intern: works shortlisting/onboarding rows like an IR Executive, and
// sees full cost/margin same as everyone internal, but never approves or
// sets commercials.
export function isIntern(role: Role) {
  return role === "IR_INTERN";
}

// CXO and IR Manager are the only org-wide, unscoped roles (spec Gate G13 /
// Read Me: "The IR Manager and CXO are the only unscoped logins") — everyone
// else only sees the campaigns they're personally assigned to (a
// CampaignTeamMember row): Brand Solutions sees only the brands/campaigns
// they personally talk to, Campaign Managers see only the campaigns they
// personally run, and IR Executives/Interns each only see the campaigns
// they're personally on. Matches a client only seeing campaigns they have
// clientAccess to.
export function isOrgWide(role: Role) {
  return role === "CXO" || role === "IR_MANAGER";
}

// Prisma `where` fragment for "which campaigns can this user see": clients
// scoped to clientAccess, CXO unscoped (sees everything), every other role
// scoped to campaigns they're a team member on. Spread this into any
// Campaign.findMany/findFirst where clause.
export function campaignVisibilityWhere(user: { id: string; role: Role }) {
  if (isClient(user.role)) return { clientAccess: { some: { clientId: user.id } } };
  if (isOrgWide(user.role)) return {};
  return { teamMembers: { some: { userId: user.id } } };
}

// Same scope, applied to an already-fetched campaign (its teamMembers/
// clientAccess must be included) — used where a single campaign is fetched
// by id and we need a not-found-style access check rather than a query filter.
export function canViewCampaign(
  user: { id: string; role: Role },
  campaign: { teamMembers: { userId: string }[]; clientAccess: { clientId: string }[] }
) {
  if (isClient(user.role)) return campaign.clientAccess.some((a) => a.clientId === user.id);
  if (isOrgWide(user.role)) return true;
  return campaign.teamMembers.some((t) => t.userId === user.id);
}

// Who can add/edit/remove User accounts (the Team admin page). CXO only —
// this is the one place a real login gets created, so it's kept to the
// single org-wide role rather than opened up to every internal role.
export function canManageTeam(role: Role) {
  return role === "CXO";
}

// Who can create a new campaign — spec: Brand Solutions exclusively ("Brief
// intake" is their step 1, and Page Permissions gives them "Create and
// edit, own clients" on Campaigns while CXO gets only "View, all"; Read Me
// is explicit that CXO writes the month lock and nothing else). Campaign
// Managers and the IR team work campaigns once they exist, they don't
// originate them. Gates both the "New Campaign"
// button/link and the createCampaign server action itself.
export function canCreateCampaign(role: Role) {
  return role === "BRAND_SOLUTIONS";
}

// Task #19 / Page Permissions: within the Shortlisting page itself, IR
// Intern only sees rows they personally sourced ("Create and edit, own
// rows"), IR Executive sees their own rows plus any sourced by an IR Intern
// on the same campaign team ("own and Intern rows"). Every other role that
// can see the campaign at all (CM, Brand Solutions, IR Manager, CXO, Client)
// sees every row — this only narrows the two sourcing roles. Pass the
// campaign's own IR_INTERN team-member user ids (from CampaignTeamMember),
// not a global lookup, since scope is per-campaign like everything else here.
export function filterCreatorsForShortlistScope<T extends { sourcedByUserId: string | null }>(
  user: { id: string; role: Role },
  creators: T[],
  campaignInternUserIds: string[]
): T[] {
  if (user.role === "IR_INTERN") {
    return creators.filter((c) => c.sourcedByUserId === user.id);
  }
  if (user.role === "IR_EXECUTIVE") {
    const internIds = new Set(campaignInternUserIds);
    return creators.filter((c) => c.sourcedByUserId === user.id || (c.sourcedByUserId !== null && internIds.has(c.sourcedByUserId)));
  }
  return creators;
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

// Gate G1: a creator row with no vet decision (Campaign Manager never set
// quotedCost) or that's been internally rejected must never reach a
// client-facing query — filtered out here, not left to each call site to
// remember, so nothing client-facing can accidentally skip this.
export function serializeCreatorsForClient<T extends { internalCost: number | null; quotedCost: number | null; status: string }>(
  creators: T[]
): Omit<T, "internalCost">[] {
  return creators.filter((c) => c.quotedCost !== null && c.status !== "REJECTED").map(serializeCreatorForClient);
}
