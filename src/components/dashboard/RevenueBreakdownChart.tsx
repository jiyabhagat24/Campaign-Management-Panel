"use client";

import { useMemo, useState } from "react";

// One row per ONBOARDED creator with a real onboarding ("closure") date —
// same closure-date convention the Finance Table uses. Revenue is the
// campaign's quoted value split evenly across that campaign's onboarded
// creators (no per-creator quoted value exists in the schema, so an even
// split is the least-arbitrary apportionment available), attributed to the
// month the creator closed.
export type RevenueDataRow = {
  brand: string;
  onboardedAt: string; // ISO
  internalCost: number;
  revenue: number;
};

const money = (n: number) =>
  Math.abs(n) >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : Math.abs(n) >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${Math.round(n)}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

type MonthRow = {
  key: string;
  label: string;
  revenue: number;
  creatorsOnboarded: number;
  avgCostPerCreator: number;
  marginValue: number;
};

// Shared chart geometry for charts 1 and 2 — same canvas so gridlines,
// axes, and month spacing line up identically between the two.
const W = 820;
const H = 280;
const PAD_L = 64;
const PAD_R = 64;
const PAD_T = 36;
const PAD_B = 34;
const plotW = W - PAD_L - PAD_R;
const plotH = H - PAD_T - PAD_B;

function niceMax(n: number) {
  if (n <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)));
  const residual = n / magnitude;
  const step = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return step * magnitude;
}

function xFor(i: number, n: number) {
  return n === 1 ? PAD_L + plotW / 2 : PAD_L + (i * plotW) / (n - 1);
}

function EmptyState({ height = 280 }: { height?: number }) {
  return (
    <div className="flex items-center justify-center text-sm text-slate-400 dark:text-slate-500" style={{ height }}>
      No onboarded creators yet.
    </div>
  );
}

function Legend({ items, y = 14 }: { items: { label: string; color: string }[]; y?: number }) {
  return (
    <g>
      {items.map((it, i) => (
        <g key={it.label} transform={`translate(${PAD_L + i * 170}, ${y})`}>
          <rect width="10" height="10" rx="2.5" fill={it.color} />
          <text x="15" y="9.5" fontSize="10.5" fontWeight="600" className="fill-slate-500 dark:fill-slate-400">
            {it.label}
          </text>
        </g>
      ))}
    </g>
  );
}

// ---------- Chart 1: Monthly Financial Performance (Revenue + Margin) ----------
function FinancialPerformanceChart({ months }: { months: MonthRow[] }) {
  if (months.length === 0) return <EmptyState />;

  const maxVal = niceMax(Math.max(...months.map((m) => m.revenue), ...months.map((m) => m.marginValue), 1));
  const yFor = (v: number) => PAD_T + plotH - (v / maxVal) * plotH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxVal);

  const linePath = (field: "revenue" | "marginValue") =>
    months.map((m, i) => `${i === 0 ? "M" : "L"} ${xFor(i, months.length).toFixed(1)} ${yFor(m[field]).toFixed(1)}`).join(" ");
  const areaPath = (field: "revenue" | "marginValue") =>
    `${linePath(field)} L ${xFor(months.length - 1, months.length).toFixed(1)} ${(PAD_T + plotH).toFixed(1)} L ${xFor(0, months.length).toFixed(1)} ${(PAD_T + plotH).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[280px]">
      <defs>
        <linearGradient id="revenueAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="marginAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <Legend
        items={[
          { label: "Revenue", color: "#4f46e5" },
          { label: "Margin Value", color: "#10b981" },
        ]}
      />
      {yTicks.map((t, i) => {
        const y = PAD_T + plotH - (i * plotH) / (yTicks.length - 1);
        return (
          <g key={t}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
            <text x={PAD_L - 8} y={y + 3} fontSize="10" textAnchor="end" className="fill-slate-400 dark:fill-slate-500">
              {money(t)}
            </text>
          </g>
        );
      })}
      {months.map((m, i) => (
        <text key={m.key} x={xFor(i, months.length)} y={H - PAD_B + 16} fontSize="10" textAnchor="middle" className="fill-slate-400 dark:fill-slate-500">
          {m.label}
        </text>
      ))}
      <path d={areaPath("revenue")} fill="url(#revenueAreaGrad)" stroke="none" />
      <path d={areaPath("marginValue")} fill="url(#marginAreaGrad)" stroke="none" />
      <path d={linePath("revenue")} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={linePath("marginValue")} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {months.map((m, i) => (
        <g key={m.key}>
          <circle cx={xFor(i, months.length)} cy={yFor(m.revenue)} r="5" fill="#fff" stroke="#4f46e5" strokeWidth="2.5" />
          <circle cx={xFor(i, months.length)} cy={yFor(m.revenue)} r="2" fill="#4f46e5">
            <title>{`${m.label} Revenue: ${money(m.revenue)}`}</title>
          </circle>
          <circle cx={xFor(i, months.length)} cy={yFor(m.marginValue)} r="5" fill="#fff" stroke="#10b981" strokeWidth="2.5" />
          <circle cx={xFor(i, months.length)} cy={yFor(m.marginValue)} r="2" fill="#10b981">
            <title>{`${m.label} Margin: ${money(m.marginValue)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

// ---------- Chart 2: Onboarding Volume (bar) vs Avg Cost per Creator (line), dual axis ----------
// Bars/points use band positions (each month gets an equal slice of the
// plot, bar centered inside it) rather than the edge-to-edge line-chart
// spacing xFor uses — with edge spacing the first/last bars overlapped the
// axis and its labels, which is what looked broken with only 1-2 months
// of demo data.
function OnboardingEconomicsChart({ months }: { months: MonthRow[] }) {
  if (months.length === 0) return <EmptyState />;

  const maxCount = niceMax(Math.max(...months.map((m) => m.creatorsOnboarded), 1));
  const maxCost = niceMax(Math.max(...months.map((m) => m.avgCostPerCreator), 1));
  const yForCount = (v: number) => PAD_T + plotH - (v / maxCount) * plotH;
  const yForCost = (v: number) => PAD_T + plotH - (v / maxCost) * plotH;
  const countTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxCount);
  const costTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxCost);

  const bandW = plotW / months.length;
  const xBand = (i: number) => PAD_L + bandW * (i + 0.5);
  const barW = Math.max(18, Math.min(46, bandW * 0.42));

  const linePath = months
    .map((m, i) => `${i === 0 ? "M" : "L"} ${xBand(i).toFixed(1)} ${yForCost(m.avgCostPerCreator).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[280px]">
      <defs>
        <linearGradient id="onboardingBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e879f9" />
          <stop offset="100%" stopColor="#c026d3" />
        </linearGradient>
      </defs>
      <Legend
        items={[
          { label: "Creators Onboarded", color: "#d946ef" },
          { label: "Avg Cost / Creator", color: "#f59e0b" },
        ]}
      />
      {countTicks.map((t, i) => {
        const y = PAD_T + plotH - (i * plotH) / (countTicks.length - 1);
        return (
          <g key={`l${t}`}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
            <text x={PAD_L - 10} y={y + 3} fontSize="10" textAnchor="end" fill="#c026d3">
              {Math.round(t)}
            </text>
          </g>
        );
      })}
      {costTicks.map((t, i) => {
        const y = PAD_T + plotH - (i * plotH) / (costTicks.length - 1);
        return (
          <text key={`r${t}`} x={W - PAD_R + 10} y={y + 3} fontSize="10" textAnchor="start" fill="#d97706">
            {money(t)}
          </text>
        );
      })}
      {months.map((m, i) => (
        <text key={m.key} x={xBand(i)} y={H - PAD_B + 16} fontSize="10" textAnchor="middle" className="fill-slate-400 dark:fill-slate-500">
          {m.label}
        </text>
      ))}
      {months.map((m, i) => {
        const topY = yForCount(m.creatorsOnboarded);
        const barH = Math.max(0, PAD_T + plotH - topY);
        return (
          <g key={m.key}>
            <rect x={xBand(i) - barW / 2} y={topY} width={barW} height={barH} fill="url(#onboardingBarGrad)" rx="6">
              <title>{`${m.label}: ${m.creatorsOnboarded} creators onboarded`}</title>
            </rect>
            {barH > 0 && (
              <text x={xBand(i)} y={topY - 7} fontSize="10.5" fontWeight="700" textAnchor="middle" fill="#a21caf">
                {m.creatorsOnboarded}
              </text>
            )}
          </g>
        );
      })}
      <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {months.map((m, i) => (
        <g key={m.key}>
          <circle cx={xBand(i)} cy={yForCost(m.avgCostPerCreator)} r="5" fill="#fff" stroke="#f59e0b" strokeWidth="2.5" />
          <circle cx={xBand(i)} cy={yForCost(m.avgCostPerCreator)} r="2" fill="#f59e0b">
            <title>{`${m.label} Avg cost/creator: ${money(m.avgCostPerCreator)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

// ---------- Chart 3: Revenue by client, stacked by month ----------
// Always shows every client — the "select a client" dropdown above only
// filters charts 1 and 2, since filtering this one down to a single client
// would leave a single bar, defeating the point of a cross-client view.
const MONTH_PALETTE = [
  "#b91c3c", "#dc4731", "#f0703b", "#f4a637", "#f9d34f", "#eef283",
  "#c8e17e", "#8fd18f", "#5cc0a0", "#3fa8b0", "#2f86b0", "#3161a8",
];

function ClientRevenueStackChart({ rows }: { rows: RevenueDataRow[] }) {
  const { brands, monthKeys, dataByBrand, totals } = useMemo(() => {
    const monthSet = new Set<string>();
    const byBrand = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const mk = monthKey(new Date(r.onboardedAt));
      monthSet.add(mk);
      if (!byBrand.has(r.brand)) byBrand.set(r.brand, new Map());
      const m = byBrand.get(r.brand)!;
      m.set(mk, (m.get(mk) ?? 0) + r.revenue);
    }
    const monthKeys = Array.from(monthSet).sort();
    const totals = new Map(
      Array.from(byBrand.entries()).map(([brand, m]) => [brand, Array.from(m.values()).reduce((s, v) => s + v, 0)])
    );
    const brands = Array.from(byBrand.keys()).sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
    return { brands, monthKeys, dataByBrand: byBrand, totals };
  }, [rows]);

  if (brands.length === 0) return <EmptyState height={340} />;

  const H3 = 320;
  const PAD_L3 = 64;
  const PAD_R3 = 24;
  const PAD_T3 = 28;
  const PAD_B3 = 30;
  const plotH3 = H3 - PAD_T3 - PAD_B3;
  const plotW3 = W - PAD_L3 - PAD_R3;
  const maxTotal = niceMax(Math.max(...Array.from(totals.values()), 1));
  const bandW = plotW3 / brands.length;
  const barW = Math.min(90, bandW * 0.55);
  const yFor = (v: number) => PAD_T3 + plotH3 - (v / maxTotal) * plotH3;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxTotal);

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H3}`} className="w-full h-[320px]">
        {yTicks.map((t, i) => {
          const y = PAD_T3 + plotH3 - (i * plotH3) / (yTicks.length - 1);
          return (
            <g key={t}>
              <line x1={PAD_L3} y1={y} x2={W - PAD_R3} y2={y} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
              <text x={PAD_L3 - 8} y={y + 3} fontSize="10" textAnchor="end" className="fill-slate-400 dark:fill-slate-500">
                {money(t)}
              </text>
            </g>
          );
        })}
        <defs>
          {brands.map((brand, bi) => {
            const x = PAD_L3 + bi * bandW + (bandW - barW) / 2;
            const total = totals.get(brand) ?? 0;
            const topY = yFor(total);
            return (
              <clipPath id={`stack-clip-${bi}`} key={brand}>
                <rect x={x} y={topY} width={barW} height={Math.max(0, PAD_T3 + plotH3 - topY)} rx="7" />
              </clipPath>
            );
          })}
        </defs>
        {brands.map((brand, bi) => {
          const x = PAD_L3 + bi * bandW + (bandW - barW) / 2;
          const total = totals.get(brand) ?? 0;
          let cum = 0;
          return (
            <g key={brand}>
              <g clipPath={`url(#stack-clip-${bi})`}>
                {monthKeys.map((mk, mi) => {
                  const v = dataByBrand.get(brand)?.get(mk) ?? 0;
                  if (v <= 0) return null;
                  const y0 = yFor(cum);
                  cum += v;
                  const y1 = yFor(cum);
                  return (
                    <rect
                      key={mk}
                      x={x}
                      y={y1}
                      width={barW}
                      height={Math.max(0, y0 - y1)}
                      fill={MONTH_PALETTE[mi % MONTH_PALETTE.length]}
                      stroke="#fff"
                      strokeWidth="1"
                    >
                      <title>{`${brand} — ${monthLabel(mk)}: ${money(v)}`}</title>
                    </rect>
                  );
                })}
              </g>
              <text x={x + barW / 2} y={yFor(total) - 8} fontSize="11" fontWeight="700" textAnchor="middle" className="fill-slate-700 dark:fill-slate-200">
                {money(total)}
              </text>
              <text x={x + barW / 2} y={H3 - PAD_B3 + 16} fontSize="10.5" fontWeight="600" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400">
                {brand}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-2">
        {monthKeys.map((mk, i) => (
          <div key={mk} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MONTH_PALETTE[i % MONTH_PALETTE.length] }} />
            <span className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400">{monthLabel(mk)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-card overflow-hidden">
      <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/40">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

export default function RevenueBreakdownChart({ rows }: { rows: RevenueDataRow[] }) {
  const [client, setClient] = useState("");

  const clients = useMemo(() => Array.from(new Set(rows.map((r) => r.brand))).sort(), [rows]);

  const months: MonthRow[] = useMemo(() => {
    const filtered = client ? rows.filter((r) => r.brand === client) : rows;
    const buckets = new Map<string, { revenue: number; internalCost: number; count: number }>();

    for (const r of filtered) {
      const key = monthKey(new Date(r.onboardedAt));
      const b = buckets.get(key) ?? { revenue: 0, internalCost: 0, count: 0 };
      b.revenue += r.revenue;
      b.internalCost += r.internalCost;
      b.count += 1;
      buckets.set(key, b);
    }

    return Array.from(buckets.keys())
      .sort()
      .map((key) => {
        const b = buckets.get(key)!;
        return {
          key,
          label: monthLabel(key),
          revenue: b.revenue,
          creatorsOnboarded: b.count,
          avgCostPerCreator: b.count > 0 ? b.internalCost / b.count : 0,
          marginValue: b.revenue - b.internalCost,
        };
      });
  }, [rows, client]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Revenue Breakdown Chart</h2>
        <select
          value={client}
          onChange={(e) => setClient(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <ChartCard title="Monthly Financial Performance" sub="Revenue and margin value, month on month">
        <FinancialPerformanceChart months={months} />
      </ChartCard>

      <ChartCard title="Onboarding Volume vs. Unit Economics" sub="Creators onboarded (bar) against average cost per creator (line)">
        <OnboardingEconomicsChart months={months} />
      </ChartCard>

      <ChartCard title="Revenue by Client" sub="Stacked by month — always shows every client, regardless of the filter above">
        <ClientRevenueStackChart rows={rows} />
      </ChartCard>
    </div>
  );
}
