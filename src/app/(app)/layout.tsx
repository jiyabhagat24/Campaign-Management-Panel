import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/Sidebar";
import AutoRefresh from "@/components/AutoRefresh";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    // h-screen + overflow-hidden here (instead of the old unbounded div) is
    // what actually fixes the sidebar — without a height cap on this
    // wrapper, it grows to match whichever page's content is tallest, but
    // the sidebar itself is a fixed h-screen box, so on any page taller
    // than one screen its dark background just stopped partway down,
    // exposing the page's own (light) background below it. Locking the
    // whole shell to exactly the viewport height and letting only <main>
    // scroll internally means the sidebar is always full-height, no matter
    // how long the page underneath it is.
    <div className="flex h-screen overflow-hidden">
      <AutoRefresh />
      <Sidebar role={user.role} name={user.name} notifications={notifications} userId={user.id} />
      <main className="h-screen flex-1 overflow-y-auto bg-panel dark:bg-slate-950">{children}</main>
    </div>
  );
}
