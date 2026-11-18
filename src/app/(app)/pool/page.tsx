import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function PoolPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Pool.</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        This page is a work in progress.
      </p>
    </div>
  );
}
