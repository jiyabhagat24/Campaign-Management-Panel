import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClient } from "@/lib/rbac";
import BackLink from "@/components/BackLink";

export default async function CommunicationsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const campaigns = isClient(user.role)
    ? await prisma.campaign.findMany({
        where: { clientAccess: { some: { userId: user.id } } },
        include: {
          remarks: {
            where: { visibility: "CLIENT" },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { author: { select: { name: true } } },
          },
          _count: { select: { remarks: { where: { visibility: "CLIENT" } } } },
        },
        orderBy: { updatedAt: "desc" },
      })
    : await prisma.campaign.findMany({
        include: {
          remarks: { orderBy: { createdAt: "desc" }, take: 1, include: { author: { select: { name: true } } } },
          _count: { select: { remarks: true } },
        },
        orderBy: { updatedAt: "desc" },
      });

  return (
    <div className="p-8">
      <BackLink label="Back" fallbackHref="/dashboard" />
      <h1 className="mt-1 text-lg font-semibold text-ink dark:text-white">Communications</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pick a campaign to see its full remark thread — no WhatsApp needed.</p>

      <div className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {campaigns.map((c) => {
          const last = c.remarks[0];
          return (
            <Link key={c.id} href={`/communications/${c.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <div className="min-w-0">
                <p className="text-sm font-medium text-brand dark:text-indigo-400">{c.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{c.brand}</p>
                {last ? (
                  <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-medium text-slate-500 dark:text-slate-400">{last.author.name}:</span> {last.body}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">No remarks yet.</p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-3 pl-4 text-right">
                {last && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {new Date(last.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </span>
                )}
                <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c._count.remarks}</span>
              </div>
            </Link>
          );
        })}
        {campaigns.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No campaigns yet.</p>}
      </div>
    </div>
  );
}
