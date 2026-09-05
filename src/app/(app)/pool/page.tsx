import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function PoolPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-ink">Pool</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        This page is a work in progress.
      </p>
    </div>
  );
}
