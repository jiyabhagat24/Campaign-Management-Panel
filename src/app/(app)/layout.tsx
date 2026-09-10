import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="flex">
      <Sidebar role={user.role} name={user.name} notifications={notifications} userId={user.id} />
      <main className="min-h-screen flex-1 overflow-y-auto bg-panel dark:bg-slate-950">{children}</main>
    </div>
  );
}
