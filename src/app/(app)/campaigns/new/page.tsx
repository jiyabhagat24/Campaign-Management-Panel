import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { canCreateCampaign, isSuperAdmin } from "@/lib/rbac";
import { createCampaign } from "@/lib/actions";
import BackLink from "@/components/BackLink";
import { PlatformBriefsFormField } from "@/components/campaign/PlatformBriefsEditor";
import { ProductLinksField, ProductCategoryField, SkuField } from "@/components/campaign/ProductLinksField";
import CreateCampaignButton from "@/components/campaign/CreateCampaignButton";
import EnterMovesFocusForm from "@/components/campaign/EnterMovesFocusForm";
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, CAMPAIGN_TYPES, CAMPAIGN_TYPE_LABELS } from "@/lib/constants";

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
  if (!canCreateCampaign(user.role) && !isSuperAdmin(user.id)) redirect("/campaigns");

  // `min` on the two deadline inputs below blocks picking a past date/time
  // in the native picker — actions.ts re-checks this server-side too, since
  // min is only a UI hint (a typed-in date isn't stopped by it).
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const minDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const minDateTime = `${minDate}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return (
    <div className="p-8">
      <BackLink label="Back" fallbackHref="/campaigns" />
      <h1 className="mt-2 text-lg font-semibold text-ink dark:text-white">New campaign</h1>
      <EnterMovesFocusForm action={create} className="mt-6 max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Business Type</label>
            <select name="businessType" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              <option value="">Select…</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BUSINESS_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Campaign Type</label>
            <select name="campaignType" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              <option value="">Select…</option>
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CAMPAIGN_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Campaign Objective</label>
            <input name="campaignObjective" placeholder="e.g. Awareness" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Target Audience</label>
            <input name="targetAudience" placeholder="e.g. Women 25-35, Tier-1 cities" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" />
          </div>
        </div>

        <ProductCategoryField name="productCategory" />
        <SkuField name="sku" />

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Client website URL</label>
          <input name="clientWebsiteUrl" type="url" placeholder="https://brand.com" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" />
        </div>

        <ProductLinksField name="productUrls" />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Shortlisting Deadline</label>
            <input name="shortlistingDeadline" type="datetime-local" min={minDateTime} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Campaign Closure Deadline</label>
            <input name="campaignClosureDeadline" type="date" min={minDate} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
          </div>
        </div>

        {/* Tick which platform(s) this campaign runs on — each ticked
            platform gets its own brief (category, deliverables, budget per
            creator, language breakdown), since e.g. an Instagram brief and
            a YouTube brief for the same campaign are usually completely
            different. Only the platforms you tick show a brief block. */}
        <PlatformBriefsFormField name="platformBriefsJson" />

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Brief</label>
          <textarea name="brief" rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" placeholder="Objective, mandatories, timelines, anything not captured above..." />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Total budget (quoted, ₹)</label>
          <input name="budgetQuoted" type="number" placeholder="Overall campaign budget, if set separately from per-creator" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500" />
        </div>

        <CreateCampaignButton />
      </EnterMovesFocusForm>
    </div>
  );
}
