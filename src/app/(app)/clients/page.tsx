import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageClients, campaignVisibilityWhere } from "@/lib/rbac";
import ClientAccessManager, { type ClientRow, type CampaignOption } from "@/components/team/ClientAccessManager";

// CXO + Brand Solutions — where a signed-up (or manually added) client
// account gets granted or revoked visibility into specific campaigns.
// Sign-up itself (src/app/signup) only ever creates a login; it never
// grants campaign access on its own, so this page is the other half of
// that flow.
//
// Page Permissions matrix: CXO sees every client (org-wide, same as
// campaignVisibilityWhere already gives CXO for campaigns). Brand Solutions
// is scoped to "own" — but "own" only ever applies to which campaigns they
// can *grant*, not to which client logins they can *see*: a Client account
// isn't tied to one owner, the same client contact often needs adding to a
// second campaign run by a different Brand Solutions person than the one
// who originally onboarded them. An earlier version of this page filtered
// the client list itself to "no access yet OR access to a scoped campaign",
// which silently hid any client who already had access to even one
// campaign outside this viewer's scope — so a real client account existed,
// but the person who needed to grant them a new campaign couldn't find them
// to check the box. Every client login is listed for every canManageClients
// role; only campaignOptions (which campaigns can actually be granted) stays
// scoped, so Brand Solutions still can't hand out access to a campaign
// they're not on.
export default async function ClientsAccessPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canManageClients(user.role)) redirect("/dashboard");

  const campaignScope = campaignVisibilityWhere(user);

  const [clients, campaigns] = await Promise.all([
    prisma.client.findMany({
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
