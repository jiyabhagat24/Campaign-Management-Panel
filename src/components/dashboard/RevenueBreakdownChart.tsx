"use client";

import { useMemo, useRef, useState } from "react";

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

// Custom on-hover tooltip shared by all three charts below. The SVG <title>
// left on every point/bar/segment stays in place too (harmless, helps
// screen readers/no-JS), but a native browser title tooltip has a ~1s hover
// delay and renders as a plain unstyled OS box — to anyone who doesn't wait
// it out, hovering just looks like it does nothing. This renders instantly,
// styled to match the app, positioned relative to the chart's own
// container div (not the page), so it tracks correctly no matter where the
// chart sits on screen.
// `key` is optional and only used to highlight the hovered element itself
// (enlarge its point, dim its sibling bars, draw a crosshair through it) —
// distinct from `lines`, which is just the tooltip's displayed text.
type TooltipState = { x: number; y: number; lines: string[]; key?: string } | null;

function useChartTooltip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  function show(e: React.MouseEvent, lines: string[], key?: string) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, lines, key });
  }
  function hide() {
    setTooltip(null);
  }
  return { containerRef, tooltip, show, hide };
}

function ChartTooltip({ tooltip }: { tooltip: TooltipState }) {
  if (!tooltip) return null;
  // Flip to the cursor's left once it's past the container's right half so
  // the box never runs off the edge of its own chart.
  const flip = tooltip.x > 400;
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      style={{ left: tooltip.x, top: tooltip.y - 12, transform: `translate(${flip ? "-100%" : "0%"}, -100%)` }}
    >
      {tooltip.lines.map((l, i) => (
        <div key={i} className={i === 0 ? "font-medium text-slate-400 dark:text-slate-500" : ""}>
          {l}
        </div>
      ))}
    </div>
  );
}

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
const H = 300;
// Extra room on every side versus before: PAD_L/PAD_R now fit a rotated
// axis-title alongside the tick labels, PAD_B fits an x-axis title below
// the month labels.
const PAD_L = 78;
const PAD_R = 78;
const PAD_T = 36;
const PAD_B = 52;
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

// A line needs 2+ points to draw an actual segment — with only one month of
// data (a single onboard-a-few-creators campaign, say), the "line" chart
// otherwise degenerates to a single lonely "M x y" with nothing to connect,
// which renders as nothing at all. Draw a flat line across the full plot
// width at that value instead, so there's a real visible line, not just a
// dot (or a barely-there dash).
function linePathFor(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const { y } = points[0];
    return `M ${PAD_L.toFixed(1)} ${y.toFixed(1)} L ${(W - PAD_R).toFixed(1)} ${y.toFixed(1)}`;
  }
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

// Same job as linePathFor, but joined with smooth cubic-bezier curves
// instead of straight segments.
//
// This used to be a plain Catmull-Rom spline. Catmull-Rom guarantees the
// curve passes exactly through every data point, but says nothing about
// what happens BETWEEN two points — it's free to bulge past both of their
// values before settling back down. On a financial line chart that's a real
// bug, not just an aesthetic quirk: trace the curve's peak between two
// months and it can sit above a gridline that neither month's actual value
// reaches, which reads exactly like "the axis doesn't match what's
// plotted" (reported live). This is monotone cubic interpolation instead
// (Fritsch–Carlson method — the same algorithm behind d3's
// curveMonotoneX): still a smooth curve through every point, but the
// tangents are clamped so a segment can never overshoot past either of its
// two endpoints' values. Provably safe for real data, which is why it's the
// standard choice for charts over actual numbers rather than decorative
// curves.
function smoothPathFor(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n < 2) return linePathFor(points);

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i]);
    slope.push((ys[i + 1] - ys[i]) / (dx[i] || 1));
  }

  // One tangent per point: the endpoints just take the one slope touching
  // them, interior points average their two neighboring slopes UNLESS the
  // line changes direction there (a local peak/trough) — in which case the
  // tangent is flattened to 0, which is what stops the curve from
  // overshooting past a peak instead of easing into it.
  const tangent: number[] = new Array(n).fill(0);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] === 0 || slope[i] === 0 || slope[i - 1] * slope[i] < 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  // Fritsch-Carlson clamp: if a segment's two tangents are jointly too
  // steep relative to its own secant slope, scale both back until they
  // aren't — this is the actual overshoot-prevention step.
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = Math.sqrt(a * a + b * b);
    if (h > 3) {
      const t = 3 / h;
      tangent[i] *= t;
      tangent[i + 1] *= t;
    }
  }

  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = xs[i] + dx[i] / 3;
    const c1y = ys[i] + (tangent[i] * dx[i]) / 3;
    const c2x = xs[i + 1] - dx[i] / 3;
    const c2y = ys[i + 1] - (tangent[i + 1] * dx[i]) / 3;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`;
  }
  return d;
}

// For a whole-number axis (a count, like creators onboarded) gridlines
// have to land on real integers — dividing the axis max into even
// fractions and rounding the label text for display (the old approach)
// draws the gridline at one value while showing a different, rounded
// number next to it, so a bar plotted at the true value sits off its own
// mislabeled line. This returns both an axis max and its tick values
// pre-snapped to whole numbers, so the label always matches its gridline.
function integerAxis(maxVal: number) {
  const safeMax = Math.max(1, Math.ceil(maxVal));
  const step = Math.max(1, Math.round(safeMax / 4));
  const top = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { max: top, ticks };
}

// X-axis title, centered under the tick labels.
function XAxisTitle({ label, width = W, padB = PAD_B, height = H }: { label: string; width?: number; padB?: number; height?: number }) {
  return (
    <text x={width / 2} y={height - 8} fontSize="11" fontWeight="700" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" letterSpacing="0.02em">
      {label.toUpperCase()}
    </text>
  );
}

// Y-axis title, rotated and centered along the plot's vertical span. Pass
// `side: "right"` for a secondary/right-hand axis.
function YAxisTitle({
  label,
  side = "left",
  padT = PAD_T,
  plotHeight = plotH,
  color,
}: {
  label: string;
  side?: "left" | "right";
  padT?: number;
  plotHeight?: number;
  color?: string;
}) {
  const x = side === "left" ? 16 : W - 16;
  const y = padT + plotHeight / 2;
  return (
    <text
      x={x}
      y={y}
      fontSize="11"
      fontWeight="700"
      textAnchor="middle"
      transform={`rotate(${side === "left" ? -90 : 90} ${x} ${y})`}
      letterSpacing="0.02em"
      fill={color}
      className={color ? undefined : "fill-slate-500 dark:fill-slate-400"}
    >
      {label.toUpperCase()}
    </text>
  );
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
  const { containerRef, tooltip, show, hide } = useChartTooltip();
  if (months.length === 0) return <EmptyState />;

  // Margin can go negative (a month's internal cost exceeding its revenue)
  // — the axis has to extend below zero for that, not just clip it, or a
  // loss month would silently render off the bottom of the plot area.
  const values = months.flatMap((m) => [m.revenue, m.marginValue]);
  const maxVal = niceMax(Math.max(...values, 1));
  const minRaw = Math.min(0, ...values);
  const minVal = minRaw < 0 ? -niceMax(-minRaw) : 0;
  const range = maxVal - minVal || 1;
  const yFor = (v: number) => PAD_T + plotH - ((v - minVal) / range) * plotH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => minVal + f * range);
  const hasNegative = minVal < 0;

  const linePath = (field: "revenue" | "marginValue") =>
    smoothPathFor(months.map((m, i) => ({ x: xFor(i, months.length), y: yFor(m[field]) })));
  // Closing corners match the line's own endpoints (full plot width for a
  // single month, per-month x positions otherwise) rather than always using
  // xFor, which collapses to the same center point for a single month and
  // would pinch the area into a sliver instead of spanning the full line.
  const areaPath = (field: "revenue" | "marginValue") => {
    const rightX = months.length === 1 ? W - PAD_R : xFor(months.length - 1, months.length);
    const leftX = months.length === 1 ? PAD_L : xFor(0, months.length);
    return `${linePath(field)} L ${rightX.toFixed(1)} ${yFor(0).toFixed(1)} L ${leftX.toFixed(1)} ${yFor(0).toFixed(1)} Z`;
  };

  const hoveredMonth = months.find((m) => m.key === tooltip?.key);

  return (
    <div ref={containerRef} className="relative">
      <ChartTooltip tooltip={tooltip} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[300px]">
      <defs>
        <linearGradient id="revenueAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C68E00" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#C68E00" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#C68E00" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="marginAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d9488" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#0d9488" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
        </linearGradient>
        <filter id="lineGlowGold" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#C68E00" floodOpacity="0.35" />
        </filter>
        <filter id="lineGlowTeal" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#0d9488" floodOpacity="0.35" />
        </filter>
      </defs>
      <Legend
        items={[
          { label: "Revenue", color: "#C68E00" },
          { label: "Margin Value", color: "#0d9488" },
        ]}
      />
      {yTicks.map((t, i) => {
        const y = PAD_T + plotH - (i * plotH) / (yTicks.length - 1);
        return (
          <g key={t}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="currentColor" strokeDasharray="3 4" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
            <text x={PAD_L - 8} y={y + 3} fontSize="10" textAnchor="end" fill="#C68E00">
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
      <XAxisTitle label="Month" />
      <YAxisTitle label="Financial Value (₹)" color="#C68E00" />
      {hasNegative && (
        <line x1={PAD_L} y1={yFor(0)} x2={W - PAD_R} y2={yFor(0)} stroke="currentColor" className="text-slate-300 dark:text-slate-600" strokeWidth="1.5" />
      )}
      {/* Crosshair: a vertical guide through whichever month is hovered, so
          it's obvious at a glance which revenue/margin pair the tooltip is
          describing even when the two dots aren't vertically close. */}
      {hoveredMonth && (
        <line
          x1={xFor(months.indexOf(hoveredMonth), months.length)}
          y1={PAD_T}
          x2={xFor(months.indexOf(hoveredMonth), months.length)}
          y2={PAD_T + plotH}
          stroke="currentColor"
          strokeDasharray="3 3"
          className="text-slate-300 dark:text-slate-600"
          strokeWidth="1"
        />
      )}
      <path className="chart-fade-rise" style={{ animationDelay: "120ms" }} d={areaPath("revenue")} fill="url(#revenueAreaGrad)" stroke="none" />
      <path className="chart-fade-rise" style={{ animationDelay: "180ms" }} d={areaPath("marginValue")} fill="url(#marginAreaGrad)" stroke="none" />
      <path
        className="chart-line-draw"
        pathLength={1000}
        d={linePath("revenue")}
        fill="none"
        stroke="#C68E00"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#lineGlowGold)"
      />
      <path
        className="chart-line-draw"
        style={{ animationDelay: "80ms" }}
        pathLength={1000}
        d={linePath("marginValue")}
        fill="none"
        stroke="#0d9488"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#lineGlowTeal)"
      />
      {months.map((m, i) => {
        const isActive = tooltip?.key === m.key;
        return (
        <g key={m.key} className="chart-fade-rise" style={{ animationDelay: `${300 + i * 40}ms` }}>
          {/* title on an invisible oversized hit circle, not just the tiny
              2px center dot — that made the tooltip only fire on a
              pixel-perfect hover, missing most of the visible marker. */}
          <g
            onMouseEnter={(e) => show(e, [m.label, `Revenue: ${exactMoney(m.revenue)}`], m.key)}
            onMouseMove={(e) => show(e, [m.label, `Revenue: ${exactMoney(m.revenue)}`], m.key)}
            onMouseLeave={hide}
            className="cursor-pointer"
          >
            <title>{`${m.label} Revenue: ${exactMoney(m.revenue)}`}</title>
            <circle cx={xFor(i, months.length)} cy={yFor(m.revenue)} r="12" fill="transparent" />
            <circle
              cx={xFor(i, months.length)}
              cy={yFor(m.revenue)}
              r={isActive ? "7" : "5"}
              fill="#fff"
              stroke="#C68E00"
              strokeWidth="2.5"
              style={{ transition: "r 150ms ease" }}
            />
            <circle cx={xFor(i, months.length)} cy={yFor(m.revenue)} r="2" fill="#C68E00" />
          </g>
          <g
            onMouseEnter={(e) => show(e, [m.label, `Margin: ${exactMoney(m.marginValue)}`], m.key)}
            onMouseMove={(e) => show(e, [m.label, `Margin: ${exactMoney(m.marginValue)}`], m.key)}
            onMouseLeave={hide}
            className="cursor-pointer"
          >
            <title>{`${m.label} Margin: ${exactMoney(m.marginValue)}`}</title>
            <circle cx={xFor(i, months.length)} cy={yFor(m.marginValue)} r="12" fill="transparent" />
            <circle
              cx={xFor(i, months.length)}
              cy={yFor(m.marginValue)}
              r={isActive ? "7" : "5"}
              fill="#fff"
              stroke="#0d9488"
              strokeWidth="2.5"
              style={{ transition: "r 150ms ease" }}
            />
            <circle cx={xFor(i, months.length)} cy={yFor(m.marginValue)} r="2" fill="#0d9488" />
          </g>
        </g>
        );
      })}
      </svg>
    </div>
  );
}

// ---------- Chart 2: Onboarding Volume (bar) vs Avg Cost per Creator (line), dual axis ----------
// Bars/points use band positions (each month gets an equal slice of the
// plot, bar centered inside it) rather than the edge-to-edge line-chart
// spacing xFor uses — with edge spacing the first/last bars overlapped the
// axis and its labels, which is what looked broken with only 1-2 months
// of demo data.
function OnboardingEconomicsChart({ months }: { months: MonthRow[] }) {
  const { containerRef, tooltip, show, hide } = useChartTooltip();
  if (months.length === 0) return <EmptyState />;

  const countAxis = integerAxis(Math.max(...months.map((m) => m.creatorsOnboarded), 1));
  const maxCount = countAxis.max;
  const maxCost = niceMax(Math.max(...months.map((m) => m.avgCostPerCreator), 1));
  const yForCount = (v: number) => PAD_T + plotH - (v / maxCount) * plotH;
  const yForCost = (v: number) => PAD_T + plotH - (v / maxCost) * plotH;
  const costTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxCost);

  const bandW = plotW / months.length;
  const xBand = (i: number) => PAD_L + bandW * (i + 0.5);
  const barW = Math.max(18, Math.min(46, bandW * 0.42));

  const linePath = smoothPathFor(months.map((m, i) => ({ x: xBand(i), y: yForCost(m.avgCostPerCreator) })));

  return (
    <div ref={containerRef} className="relative">
      <ChartTooltip tooltip={tooltip} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[300px]">
      <defs>
        <linearGradient id="onboardingBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a5b4fc" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <filter id="lineGlowRose" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#f43f5e" floodOpacity="0.35" />
        </filter>
      </defs>
      <Legend
        items={[
          { label: "Creators Onboarded", color: "#6366f1" },
          { label: "Avg Cost / Creator", color: "#f43f5e" },
        ]}
      />
      {countAxis.ticks.map((t) => {
        const y = yForCount(t);
        return (
          <g key={`l${t}`}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="currentColor" strokeDasharray="3 4" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
            <text x={PAD_L - 10} y={y + 3} fontSize="10" textAnchor="end" fill="#4f46e5">
              {t}
            </text>
          </g>
        );
      })}
      {costTicks.map((t, i) => {
        const y = PAD_T + plotH - (i * plotH) / (costTicks.length - 1);
        return (
          <text key={`r${t}`} x={W - PAD_R + 10} y={y + 3} fontSize="10" textAnchor="start" fill="#e11d48">
            {money(t)}
          </text>
        );
      })}
      {months.map((m, i) => (
        <text key={m.key} x={xBand(i)} y={H - PAD_B + 16} fontSize="10" textAnchor="middle" className="fill-slate-400 dark:fill-slate-500">
          {m.label}
        </text>
      ))}
      <XAxisTitle label="Month" />
      <YAxisTitle label="Creators Onboarded" color="#4f46e5" />
      <YAxisTitle label="Avg Cost / Creator (₹)" side="right" color="#e11d48" />
      {months.map((m, i) => {
        const topY = yForCount(m.creatorsOnboarded);
        const barH = Math.max(0, PAD_T + plotH - topY);
        const isActive = tooltip?.key === m.key;
        return (
          <g
            key={m.key}
            onMouseEnter={(e) => show(e, [m.label, `Creators onboarded: ${m.creatorsOnboarded}`], m.key)}
            onMouseMove={(e) => show(e, [m.label, `Creators onboarded: ${m.creatorsOnboarded}`], m.key)}
            onMouseLeave={hide}
            className="chart-fade-rise cursor-pointer"
            style={{ animationDelay: `${i * 45}ms`, opacity: tooltip && !isActive ? 0.55 : 1, transition: "opacity 150ms ease" }}
          >
            <rect
              x={xBand(i) - barW / 2}
              y={topY}
              width={barW}
              height={barH}
              fill="url(#onboardingBarGrad)"
              rx="6"
              style={{ transform: isActive ? "translateY(-2px)" : undefined, transformOrigin: "center bottom", transition: "transform 150ms ease" }}
            >
              <title>{`${m.label}: ${m.creatorsOnboarded} creators onboarded`}</title>
            </rect>
            {barH > 0 && (
              <text x={xBand(i)} y={topY - 7} fontSize="10.5" fontWeight="700" textAnchor="middle" fill="#4338ca">
                {m.creatorsOnboarded}
              </text>
            )}
          </g>
        );
      })}
      <path className="chart-line-draw" pathLength={1000} d={linePath} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#lineGlowRose)" />
      {months.map((m, i) => {
        const isActive = tooltip?.key === m.key;
        return (
        <g
          key={m.key}
          onMouseEnter={(e) => show(e, [m.label, `Avg cost/creator: ${exactMoney(m.avgCostPerCreator)}`], m.key)}
          onMouseMove={(e) => show(e, [m.label, `Avg cost/creator: ${exactMoney(m.avgCostPerCreator)}`], m.key)}
          onMouseLeave={hide}
          className="chart-fade-rise cursor-pointer"
          style={{ animationDelay: `${300 + i * 45}ms` }}
        >
          <title>{`${m.label} Avg cost/creator: ${exactMoney(m.avgCostPerCreator)}`}</title>
          <circle cx={xBand(i)} cy={yForCost(m.avgCostPerCreator)} r="12" fill="transparent" />
          <circle
            cx={xBand(i)}
            cy={yForCost(m.avgCostPerCreator)}
            r={isActive ? "7" : "5"}
            fill="#fff"
            stroke="#f43f5e"
            strokeWidth="2.5"
            style={{ transition: "r 150ms ease" }}
          />
          <circle cx={xBand(i)} cy={yForCost(m.avgCostPerCreator)} r="2" fill="#f43f5e" />
        </g>
        );
      })}
      </svg>
    </div>
  );
}

// ---------- Chart 3: Revenue by client, stacked by month ----------
// Always shows every client — the "select a client" dropdown above only
// filters charts 1 and 2, since filtering this one down to a single client
// would leave a single bar, defeating the point of a cross-client view.
// Deep, desaturated jewel tones instead of a bright primary-color rainbow —
// still 12 distinguishable hues (one per possible month), but reads as a
// considered palette rather than a crayon box, and sits closer to the
// brand's own warm gold (#C68E00) than the old red-to-blue spectrum did.
const MONTH_PALETTE = [
  "#b45309", "#c2410c", "#b91c1c", "#9d174d", "#86198f", "#6d28d9",
  "#4338ca", "#1d4ed8", "#0369a1", "#0e7490", "#047857", "#4d7c0f",
];

function ClientRevenueStackChart({ rows }: { rows: RevenueDataRow[] }) {
  const { containerRef, tooltip, show, hide } = useChartTooltip();
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

  if (brands.length === 0) return <EmptyState height={360} />;

  const H3 = 360;
  const PAD_L3 = 78;
  const PAD_R3 = 24;
  const PAD_T3 = 28;
  const PAD_B3 = 48;
  const plotH3 = H3 - PAD_T3 - PAD_B3;
  const plotW3 = W - PAD_L3 - PAD_R3;
  const maxTotal = niceMax(Math.max(...Array.from(totals.values()), 1));
  const bandW = plotW3 / brands.length;
  const barW = Math.min(90, bandW * 0.55);
  const yFor = (v: number) => PAD_T3 + plotH3 - (v / maxTotal) * plotH3;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxTotal);

  return (
    <div ref={containerRef} className="relative space-y-3">
      <ChartTooltip tooltip={tooltip} />
      <svg viewBox={`0 0 ${W} ${H3}`} className="w-full h-[360px]">
        {yTicks.map((t, i) => {
          const y = PAD_T3 + plotH3 - (i * plotH3) / (yTicks.length - 1);
          return (
            <g key={t}>
              <line x1={PAD_L3} y1={y} x2={W - PAD_R3} y2={y} stroke="currentColor" strokeDasharray="3 4" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
              <text x={PAD_L3 - 8} y={y + 3} fontSize="10" textAnchor="end" fill="#C68E00">
                {money(t)}
              </text>
            </g>
          );
        })}
        <defs>
          {brands.map((brand, bi) => {
            // Round only the top corners, keep the bottom square — the bar
            // sits flush on the zero baseline, so rounding the bottom
            // corners too (a plain rx on the full bounding box, as before)
            // left visible gaps between the bar and the axis at its base.
            const x = PAD_L3 + bi * bandW + (bandW - barW) / 2;
            const total = totals.get(brand) ?? 0;
            const topY = yFor(total);
            const baseY = PAD_T3 + plotH3;
            const r = Math.min(7, barW / 2, Math.max(0, baseY - topY));
            const clipPathD = `M ${x} ${baseY} L ${x} ${topY + r} Q ${x} ${topY} ${x + r} ${topY} L ${x + barW - r} ${topY} Q ${x + barW} ${topY} ${x + barW} ${topY + r} L ${x + barW} ${baseY} Z`;
            return (
              <clipPath id={`stack-clip-${bi}`} key={brand}>
                <path d={clipPathD} />
              </clipPath>
            );
          })}
        </defs>
        {brands.map((brand, bi) => {
          const x = PAD_L3 + bi * bandW + (bandW - barW) / 2;
          const total = totals.get(brand) ?? 0;
          let cum = 0;
          return (
            <g
              key={brand}
              className="chart-fade-rise"
              style={{ animationDelay: `${bi * 60}ms`, opacity: tooltip && !tooltip.key?.startsWith(`${brand}__`) ? 0.45 : 1, transition: "opacity 150ms ease" }}
            >
              <g clipPath={`url(#stack-clip-${bi})`}>
                {monthKeys.map((mk, mi) => {
                  const v = dataByBrand.get(brand)?.get(mk) ?? 0;
                  if (v <= 0) return null;
                  const y0 = yFor(cum);
                  cum += v;
                  const y1 = yFor(cum);
                  const segKey = `${brand}__${mk}`;
                  const isActive = tooltip?.key === segKey;
                  return (
                    <rect
                      key={mk}
                      x={x}
                      y={y1}
                      width={barW}
                      height={Math.max(0, y0 - y1)}
                      fill={MONTH_PALETTE[mi % MONTH_PALETTE.length]}
                      stroke={isActive ? "#1e293b" : "#fff"}
                      strokeWidth={isActive ? 1.5 : 1}
                      className="cursor-pointer"
                      style={{ transition: "stroke 120ms ease, opacity 120ms ease" }}
                      onMouseEnter={(e) => show(e, [`${brand} — ${monthLabel(mk)}`, exactMoney(v)], segKey)}
                      onMouseMove={(e) => show(e, [`${brand} — ${monthLabel(mk)}`, exactMoney(v)], segKey)}
                      onMouseLeave={hide}
                    >
                      <title>{`${brand} — ${monthLabel(mk)}: ${exactMoney(v)}`}</title>
                    </rect>
                  );
                })}
              </g>
              <text
                x={x + barW / 2}
                y={yFor(total) - 8}
                fontSize="11.5"
                fontWeight="800"
                textAnchor="middle"
                className="fill-slate-700 dark:fill-slate-200 cursor-pointer"
                onMouseEnter={(e) => show(e, [brand, `Total: ${exactMoney(total)}`], `${brand}__total`)}
                onMouseMove={(e) => show(e, [brand, `Total: ${exactMoney(total)}`], `${brand}__total`)}
                onMouseLeave={hide}
              >
                {money(total)}
              </text>
              <text x={x + barW / 2} y={H3 - PAD_B3 + 16} fontSize="10.5" fontWeight="600" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400">
                {brand}
              </text>
            </g>
          );
        })}
        <XAxisTitle label="Client" width={W} padB={PAD_B3} height={H3} />
        <YAxisTitle label="Revenue (₹)" padT={PAD_T3} plotHeight={plotH3} color="#C68E00" />
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
