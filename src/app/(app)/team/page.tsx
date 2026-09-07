import { redirect } from "next/navigation";
import Link from "next/link";
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

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Team</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Internal staff logins. Internal roles sign in with a theboredmonkey.com Google account — no password
          needed. Client logins and their campaign access are managed on the{" "}
          <Link href="/clients" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            Clients
          </Link>{" "}
          page.
        </p>
      </div>
      <TeamManagementClient
        users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        currentUserId={user.id}
      />
    </div>
  );
}
