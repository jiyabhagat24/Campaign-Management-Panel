import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { canCreateCampaign } from "@/lib/rbac";
import { createCampaign } from "@/lib/actions";
import BackLink from "@/components/BackLink";

async function create(formData: FormData) {
  "use server";
  const id = await createCampaign(formData);
  redirect(`/campaigns/${id}`);
}

export default async function NewCampaignPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Matches canCreateCampaign's gate on the createCampaign server action —
  // this just stops a CM/IR-team user from reaching the form directly by
  // URL instead of only hiding the button.
  if (!canCreateCampaign(user.role)) redirect("/campaigns");

  return (
    <div className="p-8">
      <BackLink label="Back" fallbackHref="/campaigns" />
      <h1 className="mt-2 text-lg font-semibold text-ink dark:text-white">New campaign</h1>
      <form action={create} className="mt-6 max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Campaign name</label>
          <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Brand</label>
          <input name="brand" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Brief</label>
          <textarea name="brief" required rows={5} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" placeholder="Objective, platform mix, budget, deliverable types, timelines, mandatories..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Budget (quoted, ₹)</label>
            <input name="budgetQuoted" type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Platform mix</label>
            <input name="platformMix" placeholder="YouTube, Instagram" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" />
          </div>
        </div>
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Create campaign
        </button>
      </form>
    </div>
  );
}
