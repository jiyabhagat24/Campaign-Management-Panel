"use client";

import { useState } from "react";
import { updateCampaignDetails } from "@/lib/actions";
import LanguageRequirementRows from "./LanguageRequirementRows";
import BrandAvatar from "./BrandAvatar";
import { Pencil, Calendar, Clock, IndianRupee, AlertTriangle } from "lucide-react";

export type CampaignHeaderData = {
  id: string;
  name: string;
  brand: string;
  brandLogoUrl: string | null;
  product: string | null;
  category: string | null;
  platformMix: string | null;
  deliverables: string | null;
  budgetPerCreatorMin: number | null;
  budgetPerCreatorMax: number | null;
  budgetQuoted: number | null;
  startDate: string | null; // ISO
  goLiveDeadline: string | null; // ISO
  brief: string | null;
  languageRequirements: { id: string; language: string; creatorsRequired: number }[];
};

const toDateInputValue = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

// Everything shown in the campaign page's hero card — name, brand, the
// structured brief chips, free-text brief, language breakdown, dates, and
// budgets — behind a single "Edit campaign" toggle, rather than a separate
// click-to-edit per field. On save, the page reloads so the SLA
// breached/at-risk badges (computed server-side from the new deadline) and
// everything else that reads from `campaign` stays in sync without having
// to duplicate that logic here.
export default function CampaignHeaderEditor({
  campaign,
  canEdit,
  breached,
  atRisk,
}: {
  campaign: CampaignHeaderData;
  canEdit: boolean;
  breached: boolean;
  atRisk: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(campaign.name);
  const [brand, setBrand] = useState(campaign.brand);
  const [product, setProduct] = useState(campaign.product ?? "");
  const [category, setCategory] = useState(campaign.category ?? "");
  const [platformMix, setPlatformMix] = useState(campaign.platformMix ?? "");
  const [deliverables, setDeliverables] = useState(campaign.deliverables ?? "");
  const [budgetPerCreatorMin, setBudgetPerCreatorMin] = useState(campaign.budgetPerCreatorMin?.toString() ?? "");
  const [budgetPerCreatorMax, setBudgetPerCreatorMax] = useState(campaign.budgetPerCreatorMax?.toString() ?? "");
  const [budgetQuoted, setBudgetQuoted] = useState(campaign.budgetQuoted?.toString() ?? "");
  const [startDate, setStartDate] = useState(toDateInputValue(campaign.startDate));
  const [goLiveDeadline, setGoLiveDeadline] = useState(toDateInputValue(campaign.goLiveDeadline));
  const [brief, setBrief] = useState(campaign.brief ?? "");

  if (!editing) {
    return (
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="flex items-start gap-4 min-w-0">
          <BrandAvatar brand={campaign.brand} logoUrl={campaign.brandLogoUrl} size={52} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-0.5 dark:bg-indigo-950/80 dark:border-indigo-800/80 dark:text-indigo-300">
                {campaign.brand}
              </span>
              {breached && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-600 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300">
                  <AlertTriangle className="h-3 w-3" /> SLA Breached
                </span>
              )}
              {!breached && atRisk && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" /> SLA At Risk
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11px] font-semibold text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-500 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
                >
                  <Pencil className="h-3 w-3" />
                  Edit campaign
                </button>
              )}
            </div>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{campaign.name}</h1>

            {(campaign.product || campaign.category || campaign.platformMix || campaign.deliverables || campaign.budgetPerCreatorMin || campaign.budgetPerCreatorMax) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {campaign.product && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {campaign.product}
                  </span>
                )}
                {campaign.category && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {campaign.category}
                  </span>
                )}
                {campaign.platformMix && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {campaign.platformMix}
                  </span>
                )}
                {campaign.deliverables && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {campaign.deliverables}
                  </span>
                )}
                {(campaign.budgetPerCreatorMin || campaign.budgetPerCreatorMax) && (
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                    ₹{campaign.budgetPerCreatorMin ? `${campaign.budgetPerCreatorMin.toLocaleString("en-IN")}–` : ""}
                    {campaign.budgetPerCreatorMax ? campaign.budgetPerCreatorMax.toLocaleString("en-IN") : "max"} / creator
                  </span>
                )}
              </div>
            )}

            {campaign.brief && (
              <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {campaign.brief}
              </p>
            )}

            {campaign.languageRequirements.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {campaign.languageRequirements.map((r) => (
                  <span
                    key={r.id}
                    className="rounded-lg bg-violet-50 border border-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:border-violet-800/80 dark:text-violet-300"
                  >
                    {r.language} · {r.creatorsRequired}
                  </span>
                ))}
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  Total: {campaign.languageRequirements.reduce((s, r) => s + r.creatorsRequired, 0)} creators
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:flex-col md:items-end flex-shrink-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800 pt-4 md:pt-0">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300">
            <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span>Came in:</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString("en-IN") : "—"}
            </span>
          </div>

          <div
            className={`flex items-center gap-2 text-xs font-medium border rounded-xl px-3 py-2 ${
              breached
                ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-300"
                : atRisk
                ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300"
                : "bg-slate-50 border-slate-200/70 text-slate-600 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Deadline:</span>
            <span className="font-bold">
              {campaign.goLiveDeadline ? new Date(campaign.goLiveDeadline).toLocaleDateString("en-IN") : "—"}
            </span>
          </div>

          {campaign.budgetQuoted ? (
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300">
              <IndianRupee className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Budget: ₹{campaign.budgetQuoted.toLocaleString("en-IN")}</span>
            </div>
          ) : (
            canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-500 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
              >
                <IndianRupee className="h-3.5 w-3.5" />
                Add final cost
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          const form = e.currentTarget;
          const languages = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="language"]')).map((el) => el.value);
          const counts = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="creatorsRequired"]')).map((el) =>
            parseInt(el.value, 10)
          );
          const languageRequirements = languages
            .map((language, i) => ({ language: language.trim(), creatorsRequired: counts[i] }))
            .filter((r) => r.language && Number.isFinite(r.creatorsRequired) && r.creatorsRequired > 0);

          await updateCampaignDetails(campaign.id, {
            name,
            brand,
            product: product || null,
            category: category || null,
            platformMix: platformMix || null,
            deliverables: deliverables || null,
            budgetPerCreatorMin: budgetPerCreatorMin ? Number(budgetPerCreatorMin) : null,
            budgetPerCreatorMax: budgetPerCreatorMax ? Number(budgetPerCreatorMax) : null,
            budgetQuoted: budgetQuoted ? Number(budgetQuoted) : null,
            startDate: startDate || null,
            goLiveDeadline: goLiveDeadline || null,
            brief: brief || null,
            languageRequirements,
          });
          window.location.reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save changes.");
          setSaving(false);
        }
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Campaign name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Brand</label>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Product</label>
          <input value={product} onChange={(e) => setProduct(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Platform</label>
          <input value={platformMix} onChange={(e) => setPlatformMix(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Deliverables</label>
          <input value={deliverables} onChange={(e) => setDeliverables(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Budget/creator — min (₹)</label>
          <input value={budgetPerCreatorMin} onChange={(e) => setBudgetPerCreatorMin(e.target.value)} type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Budget/creator — max (₹)</label>
          <input value={budgetPerCreatorMax} onChange={(e) => setBudgetPerCreatorMax(e.target.value)} type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Final cost / total budget (₹)</label>
          <input value={budgetQuoted} onChange={(e) => setBudgetQuoted(e.target.value)} type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Came in (start date)</label>
          <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Go-live deadline (target)</label>
          <input value={goLiveDeadline} onChange={(e) => setGoLiveDeadline(e.target.value)} type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
      </div>

      <LanguageRequirementRows initial={campaign.languageRequirements} />

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Brief</label>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
          Cancel
        </button>
      </div>
    </form>
  );
}
