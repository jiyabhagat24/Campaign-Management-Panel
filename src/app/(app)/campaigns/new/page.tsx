import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { canCreateCampaign } from "@/lib/rbac";
import { createCampaign } from "@/lib/actions";
import BackLink from "@/components/BackLink";
import { PlatformBriefsFormField } from "@/components/campaign/PlatformBriefsEditor";

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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Campaign name</label>
            <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Brand</label>
            <input name="brand" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Product</label>
          <input name="product" placeholder="e.g. Ceiling Fan" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Came in (start date)</label>
            <input name="startDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Go-live deadline <span className="font-normal text-slate-400 dark:text-slate-500">(target)</span>
            </label>
            <input name="goLiveDeadline" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
          </div>
        </div>

        {/* Tick which platform(s) this campaign runs on — each ticked
            platform gets its own brief (category, deliverables, budget per
            creator, language breakdown), since e.g. an Instagram brief and
            a YouTube brief for the same campaign are usually completely
            different. Only the platforms you tick show a brief block. */}
        <PlatformBriefsFormField name="platformBriefsJson" />

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Brief <span className="font-normal text-slate-400 dark:text-slate-500">(optional — can add later)</span>
          </label>
          <textarea name="brief" rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" placeholder="Objective, mandatories, timelines, anything not captured above..." />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Total budget (quoted, ₹)</label>
          <input name="budgetQuoted" type="number" placeholder="Overall campaign budget, if set separately from per-creator" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" />
        </div>

        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Create campaign
        </button>
      </form>
    </div>
  );
}
