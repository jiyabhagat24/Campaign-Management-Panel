import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewClientInvoices } from "@/lib/rbac";
import { formatCompactINR } from "@/lib/format";
import { lockedMonthKeys, monthKey } from "@/lib/managementData";
import { Kpi, PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";
import { Pill, fmtDate } from "@/components/gaps/Ui";

// Client finance view (gap build; spec step 29 and Client Cash "View, own
// account"). The client sees campaign value, invoices raised against them,
// what they've paid, what's due, and the agency fee or retainer. Leak rules:
// only the client's own campaigns (clientAccess), only published creators'
// quoted cost (G1), never internal cost (G2). Figures stay provisional until
// the month is locked (G12).

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default async function ClientInvoicesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canViewClientInvoices(user.role)) redirect("/dashboard");

  const campaigns = await prisma.campaign.findMany({
    where: { clientAccess: { some: { clientId: user.id } }, status: { not: "CANCELLED" } },
    select: {
      id: true, name: true, brand: true, status: true,
      financeFeeType: true, financeAgencyFeePercent: true, financeAgencyFee: true, financeRetainerFee: true,
      creators: { where: { status: "ONBOARDED", quotedCostPublished: true }, select: { finalQuotedCost: true, quotedCost: true } },
      clientInvoices: { orderBy: { invoiceRaisedAt: "desc" }, select: { id: true, invoiceNumber: true, invoiceRaisedAt: true, invoiceAmount: true, amountReceived: true, receivedAt: true, paymentTerms: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const locked = await lockedMonthKeys();

  const rows = campaigns.map((c) => {
    const value = c.creators.reduce((s, cr) => s + (cr.finalQuotedCost ?? cr.quotedCost ?? 0), 0);
    const invoiced = c.clientInvoices.reduce((s, i) => s + i.invoiceAmount, 0);
    const paid = c.clientInvoices.reduce((s, i) => s + (i.amountReceived ?? 0), 0);
    const fee =
      c.financeFeeType === "RETAINER"
        ? c.financeRetainerFee != null ? `Retainer ${inr(c.financeRetainerFee)}` : "Retainer"
        : c.financeAgencyFeePercent != null || c.financeAgencyFee != null
        ? `Agency fee ${c.financeAgencyFeePercent != null ? `${c.financeAgencyFeePercent}%` : ""}${c.financeAgencyFee != null ? ` · ${inr(c.financeAgencyFee)}` : ""}`
        : "—";
    return { c, value, invoiced, paid, due: invoiced - paid, fee };
  });
  const tot = rows.reduce((t, r) => ({ value: t.value + r.value, invoiced: t.invoiced + r.invoiced, paid: t.paid + r.paid }), { value: 0, invoiced: 0, paid: 0 });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <PageHeadline title="Your invoices and balance." subtitle="Figures are provisional until the month is closed by audit" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="Balance due" value={formatCompactINR(tot.invoiced - tot.paid)} hint="Invoiced less paid" />
        <Kpi label="Campaign value" value={formatCompactINR(tot.value)} hint="Onboarded creators, quoted cost" />
        <Kpi label="Invoiced" value={formatCompactINR(tot.invoiced)} hint={`${rows.reduce((s, r) => s + r.c.clientInvoices.length, 0)} invoices`} />
        <Kpi label="Paid" value={formatCompactINR(tot.paid)} hint="Received by TBM" />
      </div>
      {rows.length === 0 && <SandboxCard title="Invoices"><p className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No campaigns yet.</p></SandboxCard>}
      {rows.map(({ c, value, invoiced, paid, due, fee }) => (
        <SandboxCard key={c.id} title={`${c.brand} · ${c.name}`} aside={<span className="text-xs text-slate-500 dark:text-slate-400">{fee}</span>}
          footer={`Campaign value ${inr(value)} · invoiced ${inr(invoiced)} · paid ${inr(paid)} · due ${inr(due)}`}>
          <table className="w-full table-fixed text-sm">
            <thead className={theadClass}>
              <tr>
                <th className={`w-[26%] ${thClass}`}>Invoice</th>
                <th className={`w-[22%] ${thClass}`}>Amount</th>
                <th className={`w-[22%] ${thClass}`}>Paid</th>
                <th className={`w-[16%] ${thClass}`}>Due</th>
                <th className={`w-[14%] ${thClass}`}></th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {c.clientInvoices.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-500 dark:text-slate-400">No invoices raised yet.</td></tr>}
              {c.clientInvoices.map((i) => {
                const left = i.invoiceAmount - (i.amountReceived ?? 0);
                const provisional = !i.invoiceRaisedAt || !locked.has(monthKey(i.invoiceRaisedAt));
                return (
                  <tr key={i.id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{i.invoiceNumber ?? "Invoice"}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Raised {fmtDate(i.invoiceRaisedAt)}{i.paymentTerms ? ` · ${i.paymentTerms}` : ""}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{inr(i.invoiceAmount)}</td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                      <p>{inr(i.amountReceived ?? 0)}</p>
                      {i.receivedAt && <p className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(i.receivedAt)}</p>}
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">{left > 0.5 ? inr(left) : "—"}</td>
                    <td className="px-5 py-3 text-right">{left <= 0.5 ? <Pill tone="dark">Paid</Pill> : provisional ? <Pill tone="grey">Provisional</Pill> : <Pill tone="gold">Due</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SandboxCard>
      ))}
    </div>
  );
}
