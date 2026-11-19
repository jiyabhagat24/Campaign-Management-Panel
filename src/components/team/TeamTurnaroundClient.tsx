"use client";

// Team & turnaround — layout follows the TBM Campaign OS sandbox (headline,
// KPI strip with one emphasised card, titled cards with compact tables),
// coloured with the panel's own slate / indigo(gold) / amber(rose) tokens.
// Tables stack related facts inside a cell so nothing scrolls sideways.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setReportingManager } from "@/lib/teamActions";
import { AlertTriangle, Users } from "lucide-react";

export type TeamPersonRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  managerId: string | null;
  managerName: string | null;
  activeCampaigns: number;
  creatorRecords: number;
  delayedCreators: number;
  openEscalations: number;
  highEscalations: number;
};

type ManagerOption = { id: string; name: string; roleLabel: string };

const IR_ROLES = ["IR_EXECUTIVE", "IR_INTERN"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// The unit of work that matters for each role: campaigns for managers,
// onboarded creator records for IR executives/interns.
function loadOf(r: TeamPersonRow) {
  return IR_ROLES.includes(r.role) ? r.creatorRecords : r.activeCampaigns;
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint, emphasis }: { label: string; value: string | number; hint: string; emphasis?: boolean }) {
  return (
    <div
      className={
        emphasis
          ? "rounded-2xl bg-slate-900 p-5 text-white shadow-card dark:bg-slate-800"
          : "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900"
      }
    >
      <p className={`text-xs font-medium ${emphasis ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>{label}</p>
      <p className={`mt-3 text-3xl font-extrabold ${emphasis ? "text-indigo-300" : "text-slate-900 dark:text-white"}`}>{value}</p>
      <p className={`mt-1 text-xs ${emphasis ? "text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>{hint}</p>
    </div>
  );
}

export default function TeamTurnaroundClient({
  rows,
  managerOptions,
  canEdit,
  reportingLinesReady,
  usingFallbackScope,
  viewerName,
  todayLabel,
}: {
  rows: TeamPersonRow[];
  managerOptions: ManagerOption[];
  canEdit: boolean;
  reportingLinesReady: boolean;
  usingFallbackScope: boolean;
  viewerName: string;
  todayLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  const roles = useMemo(() => Array.from(new Map(rows.map((r) => [r.role, r.roleLabel])).entries()), [rows]);
  const visible = roleFilter === "ALL" ? rows : rows.filter((r) => r.role === roleFilter);

  // Relative load bar: compared with the busiest person in the same role,
  // so a CM's campaigns are never measured against an IRE's creator count.
  const maxLoadByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.role, Math.max(m.get(r.role) ?? 0, loadOf(r)));
    return m;
  }, [rows]);

  const totals = useMemo(
    () => ({
      people: rows.length,
      delayed: rows.reduce((s, r) => s + r.delayedCreators, 0),
      escalations: rows.reduce((s, r) => s + r.openEscalations, 0),
      high: rows.reduce((s, r) => s + r.highEscalations, 0),
      unassigned: rows.filter((r) => !r.managerId && r.role !== "CXO").length,
    }),
    [rows]
  );

  // Reporting tree, one card per manager (people with at least one report).
  const groups = useMemo(() => {
    const byManager = new Map<string, TeamPersonRow[]>();
    for (const r of rows) {
      if (!r.managerId) continue;
      byManager.set(r.managerId, [...(byManager.get(r.managerId) ?? []), r]);
    }
    const nameOf = new Map(managerOptions.map((m) => [m.id, m]));
    return Array.from(byManager.entries()).map(([managerId, reports]) => ({
      manager: nameOf.get(managerId) ?? { id: managerId, name: "Unknown", roleLabel: "" },
      reports,
    }));
  }, [rows, managerOptions]);
  const unassigned = rows.filter((r) => !r.managerId && r.role !== "CXO");

  function changeManager(userId: string, managerId: string) {
    setError(null);
    startTransition(async () => {
      const res = await setReportingManager(userId, managerId || null);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      {/* Headline — sandbox pattern: one sentence answering the page's job */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Team &amp; turnaround.</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Reporting lines and current load · {todayLabel} · Working calendar Monday–Friday, 11:00–19:00 IST
        </p>
      </div>

      {!reportingLinesReady && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            Reporting lines need a one-time database update before they can be saved. Run{" "}
            <code className="rounded bg-white/70 px-1 dark:bg-black/30">npx prisma db push</code>, then reload. Load figures below already work.
          </p>
        </div>
      )}
      {usingFallbackScope && reportingLinesReady && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Users className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>No one reports to {viewerName} yet, so every Campaign Manager and IR team member is shown. Set reporting lines with the Reports to dropdowns below.</p>
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi emphasis label="People in scope" value={totals.people} hint={`${totals.unassigned} without a reporting manager`} />
        <Kpi label="Delayed creator records" value={totals.delayed} hint="Go-live passed, nothing live yet" />
        <Kpi label="Open escalations owned" value={totals.escalations} hint={`${totals.high} high severity`} />
        <Kpi label="Reporting managers" value={groups.length} hint="People with at least one direct report" />
      </div>

      <Card
        title="Current occupancy"
        aside={
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="ALL">All roles</option>
            {roles.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        }
      >
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="w-[30%] px-5 py-2.5">Person</th>
              <th className="w-[22%] px-5 py-2.5">Reports to</th>
              <th className="w-[20%] px-5 py-2.5">Assigned work</th>
              <th className="w-[14%] px-5 py-2.5">Needs attention</th>
              <th className="w-[14%] px-5 py-2.5">Relative load</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No matching people.
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const max = maxLoadByRole.get(r.role) ?? 0;
              const pct = max > 0 ? Math.round((loadOf(r) / max) * 100) : 0;
              const attention = r.delayedCreators + r.openEscalations;
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-5 py-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                        {initials(r.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{r.name}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.roleLabel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {canEdit && r.role !== "CXO" ? (
                      <select
                        disabled={pending}
                        value={r.managerId ?? ""}
                        onChange={(e) => changeManager(r.id, e.target.value)}
                        className="w-full truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <option value="">No manager set</option>
                        {managerOptions
                          .filter((m) => m.id !== r.id)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · {m.roleLabel}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span className={r.managerName ? "text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"}>
                        {r.managerName ?? (r.role === "CXO" ? "—" : "Not set")}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                    <p>
                      <span className="font-semibold">{r.activeCampaigns}</span> active campaign{r.activeCampaigns === 1 ? "" : "s"}
                    </p>
                    {(IR_ROLES.includes(r.role) || r.creatorRecords > 0) && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {r.creatorRecords} creator record{r.creatorRecords === 1 ? "" : "s"}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {attention === 0 ? (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Nothing open</span>
                    ) : (
                      <div className="flex flex-col items-start gap-1">
                        {r.delayedCreators > 0 && (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            {r.delayedCreators} delayed
                          </span>
                        )}
                        {r.openEscalations > 0 && (
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              r.highEscalations > 0
                                ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {r.openEscalations} escalation{r.openEscalations === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{loadOf(r)} vs busiest {r.roleLabel}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Active campaigns count only ACTIVE campaigns. Creator records are onboarded creators the person sourced, in active campaigns. No
          performance ranking is shown until scoring rules are agreed.
        </p>
      </Card>

      <Card title="Reporting lines" aside={<span className="text-xs text-slate-500 dark:text-slate-400">Separate from campaign assignments</span>}>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <div key={g.manager.id} className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
              <p className="font-semibold text-slate-900 dark:text-white">{g.manager.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {g.manager.roleLabel} · {g.reports.length} direct report{g.reports.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-3 space-y-1.5">
                {g.reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-700 dark:text-slate-300">{r.name}</span>
                    <span className="flex-shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{r.roleLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
              <p className="font-semibold text-slate-900 dark:text-white">No manager set</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{unassigned.length} people</p>
              <ul className="mt-3 space-y-1.5">
                {unassigned.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-700 dark:text-slate-300">{r.name}</span>
                    <span className="flex-shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{r.roleLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {groups.length === 0 && unassigned.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">No team members in scope.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
