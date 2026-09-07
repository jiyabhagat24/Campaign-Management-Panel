import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/rbac";
import ClientAccessManager, { type ClientRow, type CampaignOption } from "@/components/team/ClientAccessManager";
import ClientLoginsTable, { type ClientLoginRow } from "@/components/team/ClientLoginsTable";

// CXO-only — where a signed-up (or manually added) client account gets
// granted or revoked visibility into specific campaigns. Sign-up itself
// (src/app/signup) only ever creates a login; it never grants campaign
// access on its own, so this page is the other half of that flow — the
// thing a CXO actually does after a new client shows up on the Team page.
export default async function ClientsAccessPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canManageTeam(user.role)) redirect("/dashboard");

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

  const loginRows: ClientLoginRow[] = clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    createdAt: c.createdAt,
    brandName: c.brandName,
    phone: c.phone,
    isSelfSignup: c.isSelfSignup,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-10 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Clients</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Brand-side contacts — a separate login table from internal staff, no role, no cost visibility. Clients
          create their own login at the sign-up page; grant them access to a campaign below.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Client logins</h2>
        <ClientLoginsTable clients={loginRows} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Campaign access
          </h2>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Grant or revoke which campaigns each client login can see. Signing up only creates a login — a client
            sees nothing until you check a campaign for them here.
          </p>
        </div>
        <ClientAccessManager clients={clientRows} campaigns={campaignOptions} />
      </section>
    </div>
  );
}
