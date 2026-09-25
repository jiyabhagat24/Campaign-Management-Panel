"use client";

import { useState } from "react";
import { updateCampaignDetails } from "@/lib/actions";
import PlatformBriefsEditor, { type PlatformBriefValue } from "./PlatformBriefsEditor";
import BrandAvatar from "./BrandAvatar";
import { Pencil, Calendar, Clock, IndianRupee, AlertTriangle, Link as LinkIcon, Plus, X } from "lucide-react";
import { focusNextFieldOnEnter } from "@/lib/utils";
import MultiSelectBox from "./MultiSelectBox";
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  CAMPAIGN_TYPES,
  CAMPAIGN_TYPE_LABELS,
  type BusinessType,
  type CampaignType,
} from "@/lib/constants";
import { PRODUCT_CATEGORIES } from "./ProductLinksField";

export type CampaignHeaderPlatformBrief = {
  id: string;
  platform: string;
  category: string | null;
  deliverables: string | null;
  budgetPerCreatorMin: number | null;
  budgetPerCreatorMax: number | null;
  totalCreatorsRequired: number | null;
  languageRequirements: { id: string; language: string; creatorsRequired: number }[];
};

export type CampaignHeaderData = {
  id: string;
  name: string;
  brand: string;
  brandLogoUrl: string | null;
  product: string | null;
  clientWebsiteUrl: string | null;
  productUrl: string | null;
  budgetQuoted: number | null;
  startDate: string | null; // ISO
  goLiveDeadline: string | null; // ISO
  brief: string | null;
  platformBriefs: CampaignHeaderPlatformBrief[];
  // Same fields the New Campaign form collects — editable here too now
  // (see the edit-mode form below), except Association Type/Agency Fee,
  // which stays exclusively in FinanceRow (same field, internal-cost-
  // gated there — see AssociationTypeField.tsx).
  businessType: string | null;
  campaignType: string | null;
  campaignObjective: string | null;
  targetAudience: string | null;
  productCategory: string | null;
  sku: string | null;
  productUrls: string | null; // JSON-encoded string array
  shortlistingDeadline: string | null; // ISO
  endDate: string | null; // ISO — "Campaign Closure Deadline"
};

const toDateInputValue = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const toDateTimeInputValue = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

const toEditableProductUrls = (productUrl: string | null, productUrlsJson: string | null): string[] => {
  try {
    const parsed = productUrlsJson ? JSON.parse(productUrlsJson) : [];
    if (Array.isArray(parsed) && parsed.length) return parsed.map((v) => String(v));
  } catch {}
  return productUrl ? [productUrl] : [""];
};

const toEditableBriefs = (briefs: CampaignHeaderPlatformBrief[]): PlatformBriefValue[] =>
  briefs.map((b) => ({
    platform: b.platform,
    category: b.category ?? "",
    deliverables: b.deliverables ?? "",
    budgetPerCreatorMin: b.budgetPerCreatorMin?.toString() ?? "",
    budgetPerCreatorMax: b.budgetPerCreatorMax?.toString() ?? "",
    languageRequirements:
      b.languageRequirements.length > 0
        ? b.languageRequirements.map((r) => ({ language: r.language, creatorsRequired: r.creatorsRequired.toString() }))
        : [
            { language: "", creatorsRequired: "" },
            { language: "", creatorsRequired: "" },
          ],
  }));

// Everything shown in the campaign page's hero card — name, brand, product,
// dates, final budget, free-text brief, and one brief block per platform
// (category / deliverables / budget-per-creator / language breakdown) —
// behind a single "Edit campaign" toggle. On save, the page reloads so the
// SLA breached/at-risk badges (computed server-side from the new deadline)
// stay in sync without duplicating that logic here.
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
  const [clientWebsiteUrl, setClientWebsiteUrl] = useState(campaign.clientWebsiteUrl ?? "");
  const [productUrls, setProductUrls] = useState<string[]>(() => toEditableProductUrls(campaign.productUrl, campaign.productUrls));
  const [budgetQuoted, setBudgetQuoted] = useState(campaign.budgetQuoted?.toString() ?? "");
  const [startDate, setStartDate] = useState(toDateInputValue(campaign.startDate));
  const [goLiveDeadline, setGoLiveDeadline] = useState(toDateInputValue(campaign.goLiveDeadline));
  const [brief, setBrief] = useState(campaign.brief ?? "");
  const [platformBriefs, setPlatformBriefs] = useState<PlatformBriefValue[]>(() => toEditableBriefs(campaign.platformBriefs));
  const [businessType, setBusinessType] = useState(campaign.businessType ?? "");
  const [campaignType, setCampaignType] = useState(campaign.campaignType ?? "");
  const [campaignObjective, setCampaignObjective] = useState(campaign.campaignObjective ?? "");
  const [targetAudience, setTargetAudience] = useState(campaign.targetAudience ?? "");
  const [productCategory, setProductCategory] = useState(campaign.productCategory ?? "");
  const [sku, setSku] = useState(campaign.sku ?? "");
  const [shortlistingDeadline, setShortlistingDeadline] = useState(toDateTimeInputValue(campaign.shortlistingDeadline));
  const [campaignClosureDeadline, setCampaignClosureDeadline] = useState(toDateInputValue(campaign.endDate));

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
              {campaign.product && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {campaign.product}
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

            {campaign.brief && (
              <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {campaign.brief}
              </p>
            )}

            {(campaign.clientWebsiteUrl || campaign.productUrl) && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                {campaign.clientWebsiteUrl && (
                  <a href={campaign.clientWebsiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                    <LinkIcon className="h-3 w-3" /> Client website
                  </a>
                )}
                {campaign.productUrl && (
                  <a href={campaign.productUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                    <LinkIcon className="h-3 w-3" /> Product page
                  </a>
                )}
                {/* productUrl above is just the first entry of productUrls —
                    show any extra ones the New Campaign form's "+ Add
                    another link" collected. */}
                {(() => {
                  let extraUrls: string[] = [];
                  try {
                    const parsed = campaign.productUrls ? JSON.parse(campaign.productUrls) : [];
                    if (Array.isArray(parsed)) extraUrls = parsed.slice(1);
                  } catch {}
                  return extraUrls.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                      <LinkIcon className="h-3 w-3" /> Product link {i + 2}
                    </a>
                  ));
                })()}
              </div>
            )}

            {/* One block per platform brief — Instagram and YouTube (etc.)
                can have completely different category/deliverables/budget/
                languages on the same campaign. */}
            {campaign.platformBriefs.length > 0 && (
              <div className="mt-3 space-y-2.5">
                {campaign.platformBriefs.map((b) => (
                  <div key={b.id} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white">{b.platform}</span>
                      {b.category && (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {b.category}
                        </span>
                      )}
                      {b.deliverables && (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {b.deliverables}
                        </span>
                      )}
                      {(b.budgetPerCreatorMin || b.budgetPerCreatorMax) && (
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                          ₹{b.budgetPerCreatorMin ? `${b.budgetPerCreatorMin.toLocaleString("en-IN")}–` : ""}
                          {b.budgetPerCreatorMax ? b.budgetPerCreatorMax.toLocaleString("en-IN") : "max"} / creator
                        </span>
                      )}
                    </div>

                    {b.languageRequirements.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {b.languageRequirements.map((r) => (
                          <span
                            key={r.id}
                            className="rounded-lg bg-violet-50 border border-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:border-violet-800/80 dark:text-violet-300"
                          >
                            {r.language} · {r.creatorsRequired}
                          </span>
                        ))}
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          Total: {b.totalCreatorsRequired ?? b.languageRequirements.reduce((s, r) => s + r.creatorsRequired, 0)} creators
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Gist of everything set on the New Campaign form that isn't
                shown elsewhere above — Business/Campaign Type, Objective,
                Target Audience, Product Category, SKU. Association Type/
                Agency Fee stays out of this always-visible block on purpose
                — it's the same internal-cost-gated field as FinanceRow's
                Fee type, shown/edited there only. The two extra deadlines
                (Shortlisting, Closure) show in the right-side date column
                instead, next to Came in. */}
            {(campaign.businessType ||
              campaign.campaignType ||
              campaign.productCategory ||
              campaign.sku ||
              campaign.campaignObjective ||
              campaign.targetAudience) && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Campaign Details</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {campaign.businessType && (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {BUSINESS_TYPE_LABELS[campaign.businessType as BusinessType] ?? campaign.businessType}
                    </span>
                  )}
                  {campaign.campaignType && (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {CAMPAIGN_TYPE_LABELS[campaign.campaignType as CampaignType] ?? campaign.campaignType}
                    </span>
                  )}
                  {campaign.productCategory && (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {campaign.productCategory}
                    </span>
                  )}
                  {campaign.sku && (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      SKU: {campaign.sku}
                    </span>
                  )}
                </div>
                {(campaign.campaignObjective || campaign.targetAudience) && (
                  <div className="mt-1.5 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                    {campaign.campaignObjective && (
                      <p>
                        <span className="font-semibold text-slate-500 dark:text-slate-400">Objective:</span> {campaign.campaignObjective}
                      </p>
                    )}
                    {campaign.targetAudience && (
                      <p>
                        <span className="font-semibold text-slate-500 dark:text-slate-400">Target audience:</span> {campaign.targetAudience}
                      </p>
                    )}
                  </div>
                )}
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

          {campaign.shortlistingDeadline && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300">
              <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Shortlisting by:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {new Date(campaign.shortlistingDeadline).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}

          {campaign.endDate && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300">
              <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Closure:</span>
              <span className="font-bold text-slate-900 dark:text-white">{new Date(campaign.endDate).toLocaleDateString("en-IN")}</span>
            </div>
          )}

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

          {campaign.budgetQuoted && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300">
              <IndianRupee className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Budget: ₹{campaign.budgetQuoted.toLocaleString("en-IN")}</span>
            </div>
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
          await updateCampaignDetails(campaign.id, {
            name,
            brand,
            clientWebsiteUrl: clientWebsiteUrl || null,
            productUrls,
            budgetQuoted: budgetQuoted ? Number(budgetQuoted) : null,
            startDate: startDate || null,
            goLiveDeadline: goLiveDeadline || null,
            brief: brief || null,
            platformBriefs,
            businessType: businessType || null,
            campaignType: campaignType || null,
            campaignObjective: campaignObjective || null,
            targetAudience: targetAudience || null,
            productCategory: productCategory || null,
            sku: sku || null,
            shortlistingDeadline: shortlistingDeadline || null,
            endDate: campaignClosureDeadline || null,
          });
          window.location.reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save changes.");
          setSaving(false);
        }
      }}
      onKeyDown={focusNextFieldOnEnter}
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
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Business Type</label>
          <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            <option value="">Select…</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>
                {BUSINESS_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Campaign Type</label>
          <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
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
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Campaign Objective</label>
          <input value={campaignObjective} onChange={(e) => setCampaignObjective(e.target.value)} placeholder="e.g. Awareness" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Target Audience</label>
          <input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="e.g. Women 25-35, Tier-1 cities" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Product Category</label>
        <MultiSelectBox
          options={PRODUCT_CATEGORIES}
          value={productCategory}
          onChange={setProductCategory}
          placeholder="Select categories…"
          className="w-full truncate rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
      </div>

      {/* ponytail: plain text, not SkuField's nested add/remove group UI —
          that UI is built for a fresh FormData submit, not for parsing an
          existing "Group: type, type; Group2: type" string back into
          editable groups. Upgrade if editing SKUs here turns out to be
          common. */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">SKU</label>
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. MacBook: Air, Pro, Neo" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Client website URL</label>
          <input value={clientWebsiteUrl} onChange={(e) => setClientWebsiteUrl(e.target.value)} type="url" placeholder="https://brand.com" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Final cost / total budget (₹)</label>
          <input value={budgetQuoted} onChange={(e) => setBudgetQuoted(e.target.value)} type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Product URL</label>
        <div className="space-y-2">
          {productUrls.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setProductUrls((prev) => prev.map((u, idx) => (idx === i ? e.target.value : u)))}
                placeholder="https://brand.com/product"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
              {productUrls.length > 1 && (
                <button
                  type="button"
                  onClick={() => setProductUrls((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400"
                  title="Remove this link"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setProductUrls((prev) => [...prev, ""])}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add another link</span>
        </button>
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Shortlisting Deadline</label>
          <input value={shortlistingDeadline} onChange={(e) => setShortlistingDeadline(e.target.value)} type="datetime-local" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Campaign Closure Deadline</label>
          <input value={campaignClosureDeadline} onChange={(e) => setCampaignClosureDeadline(e.target.value)} type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
        </div>
      </div>

      <PlatformBriefsEditor value={platformBriefs} onChange={setPlatformBriefs} />

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
