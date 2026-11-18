"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ViewGrowthResult } from "@/lib/viewHistory";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const compact = (n: number) =>
  n >= 10000000 ? `${(n / 10000000).toFixed(1)}Cr` : n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n));
const dayLabel = (key: string) => new Date(key + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

// Viewership Growth Graph for the Campaign Report: total views per format
// (never merged) per day, built from the view-history table that every
// metrics refresh writes to. Fetches its own data so it works wherever the
// report is rendered.
export default function ViewershipGrowthChart({ campaignId, className }: { campaignId?: string; className: string }) {
  const [data, setData] = useState<ViewGrowthResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    fetch(`/api/campaigns/${campaignId}/view-history`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const header = (
    <div className="mb-3 flex items-center gap-2">
      <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
      <p className="text-sm font-bold text-slate-900 dark:text-white">Viewership Growth</p>
    </div>
  );
  const note = (text: string) => (
    <div className={className}>
      {header}
      <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">{text}</p>
    </div>
  );

  if (!campaignId) return null;
  if (error) return note("Couldn't load view history right now.");
  if (!data) return note("Loading view history…");
  if (!data.ready) return note("View history needs a one-time database update. Run npx prisma db push, then reload.");
  if (data.points.length < 2) {
    return note(
      data.snapshotCount === 0
        ? "No view history yet. A snapshot is saved every time stats refresh, so the graph fills in from the next refresh."
        : "Only one day of view history so far. The graph appears once stats have refreshed on a second day."
    );
  }

  const config: ChartConfig = {};
  data.formats.forEach((f, i) => {
    config[f.key] = { label: f.label, color: COLORS[i % COLORS.length] };
  });

  return (
    <div className={className}>
      {header}
      <p className="mb-3 text-[11px] text-slate-400 dark:text-slate-500">Total views of live content by format, from each day's latest refresh.</p>
      <ChartContainer config={config} className="h-64 w-full">
        <LineChart data={data.points} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayLabel} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, p) => dayLabel(String(p?.[0]?.payload?.day ?? ""))}
                formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">{config[String(name)]?.label ?? String(name)}</span>
                    <span className="font-mono font-semibold">{Number(value).toLocaleString("en-IN")}</span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {data.formats.map((f) => (
            <Line key={f.key} dataKey={f.key} type="monotone" stroke={`var(--color-${f.key})`} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
