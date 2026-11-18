"use client";

// Finance ledger — layout from the TBM Campaign OS sandbox (KPI strip,
// "Creator invoices & payouts" with an eligibility column, "Vendor & payment
// terms"), in the panel's palette. Five columns per table; details open
// inside the row instead of adding columns, so nothing scrolls sideways.

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  approveCreatorInvoice,
  confirmCreatorPaymentSchedule,
  logCreatorInvoice,
  recordCreatorPayout,
  saveCreatorPaymentSchedule,
  saveCreatorVendor,
  validateCreatorInvoice,
  verifyCreatorVendor,
} from "@/lib/creatorPaymentActions";
import { formatCompactINR } from "@/lib/format";
import { Kpi, PageHeadline, SandboxCard, tbodyClass, thClass, theadClass } from "@/components/finance/SandboxUi";
import type { Role } from "@/lib/constants";

type Payout = { id: string; amount: number; paidAt: string; reference: string | null; proofUrl: string | null; milestoneId: string | null };
type Invoice = {
  id: string;
  invoiceNumber: string | null;
  amount: number;
  dueDate: string | null;
  fileUrl: string | null;
  status: string;
  rejectReason: string | null;
  cmApproved: boolean;
  approvalCurrent: boolean;
  payouts: Payout[];
};
type Milestone = { id: string; label: string; amount: number; dueDate: string | null; paid: number };
export type LedgerCreator = {
  id: string;
  name: string;
  handle: string;
  campaignId: string;
  campaignName: string;
  brand: string;
  internalCost: number | null;
  clientPayment: "NOT_INVOICED" | "NOT_RECEIVED" | "PARTIAL" | "RECEIVED";
  terms: { vendorName: string | null; vendorReference: string | null; vendorVerified: boolean; termsVersion: number; scheduleConfirmed: boolean } | null;
  milestones: Milestone[];
  invoices: Invoice[];
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const btn =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
const btnPrimary = "rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";

function Chip({ tone, children }: { tone: "ok" | "wait" | "bad" | "muted"; children: React.ReactNode }) {
  const cls = {
    ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    wait: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    bad: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    muted: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  }[tone];
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export default function FinanceLedgerClient({ creators, role, tablesReady, todayIso }: { creators: LedgerCreator[]; role: Role; tablesReady: boolean; todayIso: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"invoices" | "terms">("invoices");
  const isFinance = role === "FINANCE" || role === "CXO";
  const isCm = role === "CAMPAIGN_MANAGER" || role === "CXO";
  const [onlyMine, setOnlyMine] = useState(role === "FINANCE" || role === "CAMPAIGN_MANAGER");
  const [open, setOpen] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  const flat = useMemo(
    () =>
      creators.flatMap((c) =>
        c.invoices.map((inv) => {
          const paid = inv.payouts.reduce((s, p) => s + p.amount, 0);
          return { c, inv, paid, balance: Math.max(inv.amount - paid, 0) };
        })
      ),
    [creators]
  );

  const needsMe = (r: (typeof flat)[number]) =>
    (isFinance && (r.inv.status === "RECEIVED" || (r.inv.status === "VALIDATED" && r.inv.approvalCurrent && r.balance > 0))) ||
    (isCm && r.inv.status === "VALIDATED" && !r.inv.approvalCurrent);

  const today = new Date(todayIso).getTime();
  const k = flat
    .filter((r) => r.inv.status !== "REJECTED")
    .reduce(
      (a, r) => ({
        invoiced: a.invoiced + r.inv.amount,
        paid: a.paid + r.paid,
        due: a.due + (r.inv.dueDate && new Date(r.inv.dueDate).getTime() <= today ? r.balance : 0),
      }),
      { invoiced: 0, paid: 0, due: 0 }
    );
  const visible = onlyMine ? flat.filter(needsMe) : flat;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeadline title="Creator invoices and payouts." subtitle="Invoices are generated outside the panel. This ledger records documents, approvals and actual payouts." />

      {!tablesReady && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            The payment tables need a one-time database update. Run <code className="rounded bg-white/70 px-1 dark:bg-black/30">npx prisma db push</code>, then reload.
          </p>
        </div>
      )}
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="Invoices received" value={formatCompactINR(k.invoiced)} hint="Rejected invoices excluded" />
        <Kpi label="Actual payouts" value={formatCompactINR(k.paid)} hint="Recorded payouts only" />
        <Kpi label="Yet to be paid" value={formatCompactINR(k.invoiced - k.paid)} hint="Invoice balance" />
        <Kpi label="Due to date" value={formatCompactINR(k.due)} hint="Balance on invoices due today or earlier" />
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold dark:bg-slate-900 sm:w-fit">
        {(["invoices", "terms"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 ${tab === t ? "bg-white text-slate-900 shadow-card dark:bg-slate-800 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
          >
            {t === "invoices" ? "Creator invoices & payouts" : "Vendor & payment terms"}
          </button>
        ))}
      </div>

      {tab === "invoices" ? (
        <SandboxCard
          title="Creator invoices & payouts"
          aside={
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="accent-indigo-600" />
              Needs my action
            </label>
          }
          footer="Client receipts are a warning, not a creator payment blocker. A payout needs: Finance validation, CM approval on the current terms, a confirmed schedule and a verified vendor."
        >
          <table className="w-full table-fixed text-sm">
            <thead className={theadClass}>
              <tr>
                <th className={`w-[28%] ${thClass}`}>Creator / invoice</th>
                <th className={`w-[16%] ${thClass}`}>Amount / paid</th>
                <th className={`w-[10%] ${thClass}`}>Due</th>
                <th className={`w-[26%] ${thClass}`}>Eligibility</th>
                <th className={`w-[20%] ${thClass}`}>Action</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">
                    {onlyMine ? "Nothing waiting on you." : "No creator invoices logged yet. Log one from Vendor & payment terms."}
                  </td>
                </tr>
              )}
              {visible.map(({ c, inv, paid, balance }) => {
                const isOpen = open === inv.id;
                const overdue = inv.dueDate && new Date(inv.dueDate).getTime() < today && balance > 0;
                return (
                  <Fragment key={inv.id}>
                    <tr className="align-top">
                      <td className="px-5 py-3">
                        <button onClick={() => setOpen(isOpen ? null : inv.id)} className="flex items-start gap-1.5 text-left">
                          {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-slate-400" />}
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-900 dark:text-white">{c.name}</span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                              {c.brand} · {c.campaignName} · {inv.invoiceNumber ?? "No number"}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                        <p className="font-semibold">{inr(inv.amount)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Paid {inr(paid)}</p>
                      </td>
                      <td className={`px-5 py-3 text-xs ${overdue ? "font-semibold text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-300"}`}>{day(inv.dueDate)}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {inv.status === "RECEIVED" && <Chip tone="wait">Validation pending</Chip>}
                          {inv.status === "VALIDATED" && <Chip tone="ok">Finance validated</Chip>}
                          {inv.status === "REJECTED" && <Chip tone="bad">Rejected: {inv.rejectReason}</Chip>}
                          {inv.status !== "REJECTED" &&
                            (inv.approvalCurrent ? <Chip tone="ok">CM approved</Chip> : inv.cmApproved ? <Chip tone="bad">Terms changed · re-approve</Chip> : <Chip tone="wait">CM approval pending</Chip>)}
                          {!c.terms?.vendorVerified && <Chip tone="bad">Vendor unverified</Chip>}
                          {c.terms && !c.terms.scheduleConfirmed && <Chip tone="bad">Schedule unconfirmed</Chip>}
                          {c.clientPayment === "NOT_RECEIVED" && <Chip tone="muted">Client payment not received</Chip>}
                          {c.clientPayment === "PARTIAL" && <Chip tone="muted">Client payment partial</Chip>}
                          {balance === 0 && inv.status === "VALIDATED" && <Chip tone="ok">Paid in full</Chip>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {isFinance && inv.status === "RECEIVED" && (
                            <>
                              <button disabled={pending} className={btnPrimary} onClick={() => run(() => validateCreatorInvoice(inv.id, true))}>
                                Validate
                              </button>
                              <button
                                disabled={pending}
                                className={btn}
                                onClick={() => {
                                  const reason = window.prompt("Why is this invoice rejected?");
                                  if (reason) run(() => validateCreatorInvoice(inv.id, false, reason));
                                }}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {isCm && inv.status === "VALIDATED" && !inv.approvalCurrent && (
                            <button disabled={pending} className={btnPrimary} onClick={() => run(() => approveCreatorInvoice(inv.id))}>
                              Approve for payment
                            </button>
                          )}
                          {isFinance && inv.approvalCurrent && balance > 0 && (
                            <button className={btnPrimary} onClick={() => setOpen(inv.id)}>
                              Record payout
                            </button>
                          )}
                          {inv.payouts.length > 0 && (
                            <button className={btn} onClick={() => setOpen(isOpen ? null : inv.id)}>
                              Payment history
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50/70 px-5 py-4 dark:bg-slate-950/40">
                          <InvoiceDetail c={c} inv={inv} balance={balance} canPay={isFinance && inv.approvalCurrent && balance > 0} pending={pending} run={run} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </SandboxCard>
      ) : (
        <SandboxCard title="Vendor & payment terms" footer="Changing the schedule or vendor details invalidates earlier approvals: the CM must confirm the schedule and approve open invoices again, and Finance must re-verify the vendor. Never enter bank account numbers here.">
          <table className="w-full table-fixed text-sm">
            <thead className={theadClass}>
              <tr>
                <th className={`w-[26%] ${thClass}`}>Creator</th>
                <th className={`w-[22%] ${thClass}`}>Vendor</th>
                <th className={`w-[32%] ${thClass}`}>Payment schedule</th>
                <th className={`w-[20%] ${thClass}`}>Action</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {creators.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No onboarded creators in your campaigns.</td>
                </tr>
              )}
              {creators.map((c) => {
                const isOpen = open === `terms-${c.id}`;
                return (
                  <Fragment key={c.id}>
                    <tr className="align-top">
                      <td className="px-5 py-3">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{c.name}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {c.brand} · {c.campaignName}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        {c.terms?.vendorName ? (
                          <>
                            <p className="truncate text-slate-700 dark:text-slate-300">{c.terms.vendorName}</p>
                            {c.terms.vendorVerified ? <Chip tone="ok">Verified</Chip> : <Chip tone="bad">Unverified</Chip>}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Not added</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {c.milestones.length === 0 ? (
                          <span className="text-xs text-slate-400 dark:text-slate-500">No schedule</span>
                        ) : (
                          <ul className="space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
                            {c.milestones.map((m) => (
                              <li key={m.id} className="truncate">
                                {m.label} · {inr(m.amount)} · {day(m.dueDate)} {m.paid > 0 && <span className="text-emerald-600 dark:text-emerald-400">({inr(m.paid)} paid)</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {c.terms && c.milestones.length > 0 && (
                          <div className="mt-1">{c.terms.scheduleConfirmed ? <Chip tone="ok">CM confirmed</Chip> : <Chip tone="bad">Awaiting CM confirmation</Chip>}</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {isCm && c.terms && c.milestones.length > 0 && !c.terms.scheduleConfirmed && (
                            <button disabled={pending} className={btnPrimary} onClick={() => run(() => confirmCreatorPaymentSchedule(c.id))}>
                              Confirm schedule
                            </button>
                          )}
                          {isFinance && c.terms?.vendorName && !c.terms.vendorVerified && (
                            <button disabled={pending} className={btnPrimary} onClick={() => run(() => verifyCreatorVendor(c.id))}>
                              Verify vendor
                            </button>
                          )}
                          <button className={btn} onClick={() => setOpen(isOpen ? null : `terms-${c.id}`)}>
                            {isOpen ? "Close" : "Edit / log invoice"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={4} className="bg-slate-50/70 px-5 py-4 dark:bg-slate-950/40">
                          <TermsEditor c={c} role={role} pending={pending} run={run} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </SandboxCard>
      )}
    </div>
  );
}

type RunFn = (fn: () => Promise<{ error?: string }>, after?: () => void) => void;

function InvoiceDetail({ c, inv, balance, canPay, pending, run }: { c: LedgerCreator; inv: Invoice; balance: number; canPay: boolean; pending: boolean; run: RunFn }) {
  const openMs = c.milestones.filter((m) => m.paid + 0.5 < m.amount);
  const [ms, setMs] = useState<string>(openMs[0]?.id ?? "");
  const [amount, setAmount] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const msLeft = (id: string) => {
    const m = c.milestones.find((x) => x.id === id);
    return m ? Math.max(m.amount - m.paid, 0) : balance;
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Payment history</p>
        {inv.payouts.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No payouts yet.</p>
        ) : (
          <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            {inv.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{inr(p.amount)}</span>
                <span>{day(p.paidAt)}</span>
                {p.milestoneId && <span className="text-slate-500">· {c.milestones.find((m) => m.id === p.milestoneId)?.label}</span>}
                {p.reference && <span className="text-slate-500">· Ref {p.reference}</span>}
                {p.proofUrl && (
                  <a href={p.proofUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                    Open proof
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {inv.fileUrl && (
          <a href={inv.fileUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            Open invoice document
          </a>
        )}
      </div>
      {canPay && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Record payout · {inr(balance)} left</p>
          <select className={inputCls} value={ms} onChange={(e) => setMs(e.target.value)}>
            <option value="">Not tied to a milestone</option>
            {openMs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {inr(m.amount - m.paid)} left
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} type="number" min={0} placeholder={`Amount (max ${inr(Math.min(balance, msLeft(ms)))})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input className={inputCls} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <input className={inputCls} placeholder="UTR / transaction reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          <input className={inputCls} placeholder="Link to payment proof" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
          <button
            disabled={pending || !amount}
            className={btnPrimary}
            onClick={() => run(() => recordCreatorPayout({ invoiceId: inv.id, milestoneId: ms || null, amount: Number(amount), paidAt, reference, proofUrl }), () => setAmount(""))}
          >
            Record payout
          </button>
        </div>
      )}
    </div>
  );
}

function TermsEditor({ c, role, pending, run }: { c: LedgerCreator; role: Role; pending: boolean; run: RunFn }) {
  const canSchedule = role === "CAMPAIGN_MANAGER" || role === "CXO";
  const canVendor = canSchedule || role === "FINANCE";
  const canInvoice = ["IR_EXECUTIVE", "IR_MANAGER", "CAMPAIGN_MANAGER", "FINANCE", "CXO"].includes(role);
  const locked = c.milestones.some((m) => m.paid > 0);
  const [rows, setRows] = useState(
    c.milestones.length
      ? c.milestones.map((m) => ({ label: m.label, amount: String(m.amount), dueDate: m.dueDate?.slice(0, 10) ?? "" }))
      : [{ label: "Final settlement", amount: c.internalCost ? String(c.internalCost) : "", dueDate: "" }]
  );
  const [vendorName, setVendorName] = useState(c.terms?.vendorName ?? "");
  const [vendorRef, setVendorRef] = useState(c.terms?.vendorReference ?? "");
  const [inv, setInv] = useState({ invoiceNumber: "", amount: "", dueDate: "", fileUrl: "" });
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Payment schedule</p>
        {!canSchedule ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">The Campaign Manager sets the schedule.</p>
        ) : locked ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Payouts are recorded against this schedule, so it is locked.</p>
        ) : (
          <>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_110px_28px] gap-1.5">
                <input className={inputCls} placeholder="Milestone" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input className={inputCls} type="number" placeholder="₹" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <input className={inputCls} type="date" value={r.dueDate} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} />
                <button className="text-slate-400 hover:text-rose-600" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove milestone">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400" onClick={() => setRows([...rows, { label: "", amount: "", dueDate: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Add milestone
              </button>
              <span className={`text-xs ${c.internalCost !== null && Math.abs(total - c.internalCost) > 0.5 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
                Total {inr(total)}
                {c.internalCost !== null && ` of ${inr(c.internalCost)} payout`}
              </span>
            </div>
            <button
              disabled={pending}
              className={btnPrimary}
              onClick={() => run(() => saveCreatorPaymentSchedule(c.id, rows.map((r) => ({ label: r.label, amount: Number(r.amount), dueDate: r.dueDate || null }))))}
            >
              Save schedule
            </button>
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Vendor</p>
        {canVendor ? (
          <>
            <input className={inputCls} placeholder="Vendor / legal name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
            <input className={inputCls} placeholder="PAN / GST / vendor code (no bank details)" value={vendorRef} onChange={(e) => setVendorRef(e.target.value)} />
            <button disabled={pending} className={btnPrimary} onClick={() => run(() => saveCreatorVendor(c.id, vendorName, vendorRef))}>
              Save vendor
            </button>
          </>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">The CM or Finance edits vendor details.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Log creator invoice</p>
        {canInvoice ? (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <input className={inputCls} placeholder="Invoice no." value={inv.invoiceNumber} onChange={(e) => setInv({ ...inv, invoiceNumber: e.target.value })} />
              <input className={inputCls} type="number" placeholder="Amount ₹" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} />
            </div>
            <input className={inputCls} type="date" value={inv.dueDate} onChange={(e) => setInv({ ...inv, dueDate: e.target.value })} />
            <input className={inputCls} placeholder="Link to invoice document" value={inv.fileUrl} onChange={(e) => setInv({ ...inv, fileUrl: e.target.value })} />
            <button
              disabled={pending || !inv.amount}
              className={btnPrimary}
              onClick={() =>
                run(
                  () => logCreatorInvoice({ creatorId: c.id, invoiceNumber: inv.invoiceNumber, amount: Number(inv.amount), dueDate: inv.dueDate || null, fileUrl: inv.fileUrl }),
                  () => setInv({ invoiceNumber: "", amount: "", dueDate: "", fileUrl: "" })
                )
              }
            >
              Log invoice
            </button>
          </>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">Your role can't log invoices.</p>
        )}
      </div>
    </div>
  );
}
