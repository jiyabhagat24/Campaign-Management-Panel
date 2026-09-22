"use client";

// Rebuilt on shadcn/ui's chart primitive (src/components/ui/chart.tsx) over
// Recharts, replacing the hand-rolled SVG charts this file used to contain.
// Two concrete wins from the switch, not just "using a known library":
// Recharts' built-in `type="monotone"` curve is the same overshoot-safe
// interpolation this file used to hand-implement (Fritsch-Carlson) after a
// plain Catmull-Rom spline was found to visually disagree with its own axis
// — now it's just a prop. And the tooltip/legend/grid/axis styling comes
// from the shared chart primitive, so it automatically matches the design
// tokens in globals.css (light + dark) instead of each chart hand-rolling
// its own colors.
import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

// One row per ONBOARDED creator with a real onboarding ("closure") date —
// same closure-date convention the Finance Table uses. Revenue is that
// creator's own Final Quoted Cost (falling back to Quoted Cost), attributed
// to the month the creator closed.
export type RevenueDataRow = {
  brand: string;
  onboardedAt: string; // ISO
  internalCost: number;
  revenue: number;
};

// Same Lakh/Crore breakpoints as formatCompactINR, plus a K tier below 1L —
// chart axis labels and tooltips benefit from that extra granularity at
// small scale, which the dashboard summary cards don't need.
const money = (n: number) =>
  Math.abs(n) >= 10000000
    ? `₹${(n / 10000000).toFixed(2)}Cr`
    : Math.abs(n) >= 100000
    ? `₹${(n / 100000).toFixed(1)}L`
    : Math.abs(n) >= 1000
    ? `₹${(n / 1000).toFixed(1)}K`
    : `₹${Math.round(n)}`;
// Exact figure for hover tooltips — money() above rounds to 1-2 decimal
// places of L/Cr/K for on-chart labels where space is tight, which isn't
// what you want when you're deliberately hovering for the precise number.
const exactMoney = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
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

// A money-formatted row in the tooltip — shared by charts 1 and 2 so every
// rupee figure a viewer hovers shows the exact amount, not money()'s
// rounded L/Cr/K used on the axis itself.
function moneyTooltipRow(value: unknown, name: unknown) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="text-muted-foreground">{String(name)}</span>
      <span className="font-mono font-medium tabular-nums text-foreground">{exactMoney(Number(value))}</span>
    </div>
  );
}

function EmptyState({ height = 280 }: { height?: number }) {
  return (
    <div className="flex items-center justify-center text-sm text-slate-400 dark:text-slate-500" style={{ height }}>
      No onboarded creators yet.
    </div>
  );
}

// ---------- Chart 1: Monthly Financial Performance (Revenue + Margin) ----------
const financialConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  marginValue: { label: "Margin Value", color: "var(--chart-2)" },
} satisfies ChartConfig;

function FinancialPerformanceChart({ months }: { months: MonthRow[] }) {
  if (months.length === 0) return <EmptyState />;

  return (
    <ChartContainer config={financialConfig} className="aspect-auto h-[300px] w-full">
      <LineChart data={months} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} fontSize={10.5} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={10.5} width={56} tickFormatter={money} />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={<ChartTooltipContent formatter={moneyTooltipRow} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        {/* A <Line> needs 2+ points to draw an actual segment — with a
            single month of data it silently renders nothing at all, dot
            included. A ReferenceLine draws the same flat guide across the
            full width the old hand-rolled chart used to for this exact
            case, so there's always a visible line once there's any data. */}
        {months.length === 1 ? (
          <>
            <ReferenceLine y={months[0].revenue} stroke="var(--color-revenue)" strokeWidth={2.5} />
            <ReferenceLine y={months[0].marginValue} stroke="var(--color-marginValue)" strokeWidth={2.5} />
          </>
        ) : (
          <>
            <Line dataKey="revenue" type="monotone" stroke="var(--color-revenue)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
            <Line dataKey="marginValue" type="monotone" stroke="var(--color-marginValue)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
          </>
        )}
      </LineChart>
    </ChartContainer>
  );
}

// ---------- Chart 2: Onboarding Volume (bar) vs Avg Cost per Creator (line), dual axis ----------
const onboardingConfig = {
  creatorsOnboarded: { label: "Creators Onboarded", color: "var(--chart-3)" },
  avgCostPerCreator: { label: "Avg Cost / Creator", color: "var(--chart-4)" },
} satisfies ChartConfig;

function OnboardingEconomicsChart({ months }: { months: MonthRow[] }) {
  if (months.length === 0) return <EmptyState />;

  return (
    <ChartContainer config={onboardingConfig} className="aspect-auto h-[300px] w-full">
      <ComposedChart data={months} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} fontSize={10.5} />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={10.5}
          width={28}
          allowDecimals={false}
        />
        <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tickMargin={8} fontSize={10.5} width={56} tickFormatter={money} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              formatter={(value, name) =>
                name === "avgCostPerCreator" ? moneyTooltipRow(value, name) : (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{String(name)}</span>
                    <span className="font-mono font-medium tabular-nums text-foreground">{String(value)}</span>
                  </div>
                )
              }
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar yAxisId="left" dataKey="creatorsOnboarded" fill="var(--color-creatorsOnboarded)" radius={[6, 6, 0, 0]} maxBarSize={46} />
        {/* Same single-point gap as the chart above: a <Line> with one data
            point draws nothing, so a lone onboarding month would show the
            bar but no cost line at all. */}
        {months.length === 1 ? (
          <ReferenceLine yAxisId="right" y={months[0].avgCostPerCreator} stroke="var(--color-avgCostPerCreator)" strokeWidth={2.5} />
        ) : (
          <Line
            yAxisId="right"
            dataKey="avgCostPerCreator"
            type="monotone"
            stroke="var(--color-avgCostPerCreator)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2 }}
          />
        )}
      </ComposedChart>
    </ChartContainer>
  );
}

// ---------- Chart 3: Revenue by client, stacked by month ----------
// Deep, desaturated jewel tones instead of a bright primary-color rainbow —
// still 12 distinguishable hues (one per possible month), but reads as a
// considered palette rather than a crayon box, and sits closer to the
// brand's own warm gold (#C68E00) than a red-to-blue spectrum would.
const MONTH_PALETTE = [
  "#b45309", "#c2410c", "#b91c1c", "#9d174d", "#86198f", "#6d28d9",
  "#4338ca", "#1d4ed8", "#0369a1", "#0e7490", "#047857", "#4d7c0f",
];

function ClientRevenueStackChart({ rows }: { rows: RevenueDataRow[] }) {
  const { data, monthKeys, config } = useMemo(() => {
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
    const rowsByBrand = Array.from(byBrand.entries()).map(([brand, m]) => {
      const row: Record<string, string | number> = { brand };
      let total = 0;
      for (const mk of monthKeys) {
        const v = m.get(mk) ?? 0;
        row[mk] = v;
        total += v;
      }
      row.__total = total;
      return row;
    });
    rowsByBrand.sort((a, b) => (b.__total as number) - (a.__total as number));

    const config: ChartConfig = {};
    monthKeys.forEach((mk, i) => {
      config[mk] = { label: monthLabel(mk), color: MONTH_PALETTE[i % MONTH_PALETTE.length] };
    });

    return { data: rowsByBrand, monthKeys, config };
  }, [rows]);

  if (data.length === 0) return <EmptyState height={360} />;

  return (
    <ChartContainer config={config} className="aspect-auto h-[360px] w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 4, top: 24 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="brand" tickLine={false} axisLine={false} tickMargin={10} fontSize={10.5} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={10.5} width={56} tickFormatter={money} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={<ChartTooltipContent formatter={moneyTooltipRow} />}
        />
        {monthKeys.map((mk, i) => (
          <Bar
            key={mk}
            dataKey={mk}
            stackId="revenue"
            fill={`var(--color-${mk})`}
            maxBarSize={90}
            radius={i === monthKeys.length - 1 ? [6, 6, 0, 0] : undefined}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-card overflow-hidden transition-shadow duration-200 hover:shadow-card-hover">
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
