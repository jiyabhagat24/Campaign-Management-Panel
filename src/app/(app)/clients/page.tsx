import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageClients, campaignVisibilityWhere, isOrgWide } from "@/lib/rbac";
import ClientAccessManager, { type ClientRow, type CampaignOption } from "@/components/team/ClientAccessManager";

// CXO + Brand Solutions — where a signed-up (or manually added) client
// account gets granted or revoked visibility into specific campaigns.
// Sign-up itself (src/app/signup) only ever creates a login; it never
// grants campaign access on its own, so this page is the other half of
// that flow.
//
// Page Permissions matrix: CXO sees every client (org-wide, same as
// campaignVisibilityWhere already gives CXO for campaigns). Brand Solutions
// is scoped to "own" — clients tied to a campaign they're a team member on
// — but a brand-new self-signup with no campaign access granted yet has to
// stay visible too, otherwise nobody could ever onboard them in the first
// place; campaignOptions (which campaigns a client can be granted) is
// scoped the same way so Brand Solutions can't hand out access to a
// campaign outside their own scope.
export default async function ClientsAccessPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canManageClients(user.role)) redirect("/dashboard");

  const campaignScope = campaignVisibilityWhere(user);
  const orgWide = isOrgWide(user.role);

  const [clients, campaigns] = await Promise.all([
    prisma.client.findMany({
      where: orgWide
        ? undefined
        : { OR: [{ campaignAccess: { none: {} } }, { campaignAccess: { some: { campaign: campaignScope } } }] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        signup: { select: { brandName: true, phone: true } },
        campaignAccess: { select: { campaignId: true } },
      },
    }),
    prisma.campaign.findMany({
      where: campaignScope,
      orderBy: [{ brand: "asc" }, { name: "asc" }],
      select: { id: true, name: true, brand: true, status: true },
    }),
  ]);

  const clientRows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    createdAt: c.createdAt.toISOString(),
    brandName: c.signup?.brandName ?? null,
    phone: c.signup?.phone ?? null,
    isSelfSignup: c.signup !== null,
    campaignIds: c.campaignAccess.map((a) => a.campaignId),
  }));

  const campaignOptions: CampaignOption[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    brand: c.brand,
    status: c.status,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Clients</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Grant or revoke which campaigns each client login can see. Clients create their own login at the sign-up
          page — signing up only creates a login, a client sees nothing until you check a campaign for them below.
        </p>
      </div>

      <ClientAccessManager clients={clientRows} campaigns={campaignOptions} />
    </div>
  );
}
