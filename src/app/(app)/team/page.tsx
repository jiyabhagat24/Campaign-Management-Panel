import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam, isSuperAdmin } from "@/lib/rbac";
import TeamManagementClient from "@/components/team/TeamManagementClient";

// CXO-only admin page — the self-serve replacement for creating User rows
// by hand (prisma/seed.ts or Prisma Studio). See src/lib/actions.ts's
// createTeamUser/updateTeamUserRole/deleteTeamUser for the enforcement;
// this page is just the UI, the real gate is in those server actions.
//
// Page Permissions matrix: IR Manager also gets in here, but read-only and
// scoped to "IR team only" — not the whole roster, and no add/edit/delete
// controls (those stay CXO-exclusive; createTeamUser/updateTeamUserRole/
// deleteTeamUser still gate on canManageTeam server-side regardless of what
// this page renders).
const IR_TEAM_ROLES = ["IR_MANAGER", "IR_EXECUTIVE", "IR_INTERN"];

export default async function TeamPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const isIrManager = user.role === "IR_MANAGER";
  if (!canManageTeam(user.role) && !isIrManager && !isSuperAdmin(user.id)) redirect("/dashboard");

  const readOnly = isIrManager && !isSuperAdmin(user.id);

  const users = await prisma.user.findMany({
    where: readOnly ? { role: { in: IR_TEAM_ROLES } } : undefined,
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
        readOnly={readOnly}
      />
    </div>
  );
}
