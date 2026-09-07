import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/rbac";
import TeamManagementClient from "@/components/team/TeamManagementClient";

// CXO-only admin page — the self-serve replacement for creating User rows
// by hand (prisma/seed.ts or Prisma Studio). See src/lib/actions.ts's
// createTeamUser/updateTeamUserRole/deleteTeamUser for the enforcement;
// this page is just the UI, the real gate is in those server actions.
export default async function TeamPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canManageTeam(user.role)) redirect("/dashboard");

  const [users, clients] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.client.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        // Only set for clients who came through the public self-serve
        // sign-up form (src/app/signup) — null for accounts a CXO added by
        // hand here, which never had a brand/phone to capture. Surfaced so
        // whoever's granting campaign access after a sign-up knows which
        // brand this new login is actually for.
        signup: { select: { brandName: true, phone: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Team</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Internal staff and client contacts are separate logins, kept in separate tables below. Internal roles
          sign in with a theboredmonkey.com Google account — no password needed. Clients sign in with the email
          and password set here.
        </p>
      </div>
      <TeamManagementClient
        users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        clients={clients.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
        currentUserId={user.id}
      />
    </div>
  );
}
