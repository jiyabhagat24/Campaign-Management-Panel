import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageClients, campaignVisibilityWhere, isSuperAdmin } from "@/lib/rbac";
import { Wallet } from "lucide-react";
import ClientInvoicesPanel from "@/components/campaign/ClientInvoicesPanel";
import BrandAvatar from "@/components/campaign/BrandAvatar";

// Step 28 — "Client Cash": Brand Solutions' own worklist for logging and
// chasing client invoices, one campaign at a time, across every campaign
// they can see. Gated the same as the Clients page (canManageClients: CXO +
// Brand Solutions) since Brand Solutions owns client-side money the same
// way it owns client intake/access. Reuses ClientInvoicesPanel — the exact
// same component that renders the client's own read-only Finance tab (Step
// 29) on their campaign page, just with canEdit=true here.
export default async function ClientCashPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canManageClients(user.role) && !isSuperAdmin(user.id)) redirect("/dashboard");

  const campaigns = await prisma.campaign.findMany({
    where: { ...campaignVisibilityWhere(user), status: { notIn: ["CANCELLED"] } },
    select: {
      id: true,
      name: true,
      brand: true,
      brandLogoUrl: true,
      financeFeeType: true,
      financeRetainerFee: true,
      financeAgencyFeePercent: true,
      creators: {
        where: { status: "ONBOARDED" },
        select: { finalQuotedCost: true, quotedCost: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const invoices = await (prisma as any).clientInvoice.findMany({
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
  });
  const invoicesByCampaign = new Map<string, any[]>();
  for (const inv of invoices) {
    const list = invoicesByCampaign.get(inv.campaignId) ?? [];
    list.push(inv);
    invoicesByCampaign.set(inv.campaignId, list);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <Wallet className="h-6 w-6 text-emerald-500" />
          Client Cash
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Log and track client invoices per campaign — this is what feeds each client's own read-only Finance tab.
        </p>
      </div>

      {campaigns.length === 0 && (
        <p className="rounded-xl border border-slate-200/80 bg-white p-4 text-sm text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
          No campaigns to show yet.
        </p>
      )}

      <div className="space-y-10">
        {campaigns.map((c) => (
          <div key={c.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <BrandAvatar brand={c.brand} logoUrl={c.brandLogoUrl} size={32} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{c.brand}</p>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{c.name}</h2>
              </div>
            </div>
            <ClientInvoicesPanel
              campaignId={c.id}
              canEdit
              invoices={(invoicesByCampaign.get(c.id) ?? []).map((inv) => ({
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                invoiceRaisedAt: inv.invoiceRaisedAt,
                invoiceAmount: inv.invoiceAmount,
                amountReceived: inv.amountReceived,
                receivedAt: inv.receivedAt,
                paymentTerms: inv.paymentTerms,
                remark: inv.remark,
              }))}
              finalClosedCost={
                c.creators.length > 0 ? c.creators.reduce((s, cr) => s + (cr.finalQuotedCost ?? cr.quotedCost ?? 0), 0) : null
              }
              financeFeeType={c.financeFeeType}
              financeRetainerFee={c.financeRetainerFee}
              financeAgencyFeePercent={c.financeAgencyFeePercent}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
