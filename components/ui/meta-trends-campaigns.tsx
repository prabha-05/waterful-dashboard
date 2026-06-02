"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const BORDER = "#e7d9c1";
const BLUE = "#7c8bb2";
const CREAM_BG = "#faf6ef";

function formatInr(v: number) {
  if (v >= 100000) return `Rs.${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `Rs.${(v / 1000).toFixed(1)}K`;
  return `Rs.${Math.round(v).toLocaleString("en-IN")}`;
}
function formatNum(v: number) {
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return `${v}`;
}


type DailyPoint = { date: string; label: string; value: number };
type Tags = { buyingType: "CBO" | "ABO" | null; advantagePlus: boolean; kind: "Scaling" | "Testing" | null };

type Campaign = {
  metaCampaignId: string;
  name: string;
  status: string;
  objective: string | null;
  tags: Tags;
  adSetsCount: number;
  adsCount: number;
  dailyBudget: number | null;
  current: {
    spend: number;
    purchases: number;
    purchaseValue: number;
    reach: number;
    impressions: number;
    roas: number;
    cpp: number;
    frequency: number;
  };
  previous: Campaign["current"] | null;
  series: {
    spend: DailyPoint[];
    roas: DailyPoint[];
    cpp: DailyPoint[];
    purchases: DailyPoint[];
    reach: DailyPoint[];
    frequency: DailyPoint[];
  };
};

type Alert = { tone: "red" | "amber" | "green"; text: string };
type ApiResp = {
  days: number;
  window: { from: string; to: string };
  priorWindow: { from: string; to: string };
  campaigns: Campaign[];
  alerts: Alert[];
};

// Quality colors used everywhere on this page.
type Quality = "good" | "decent" | "bad" | "neutral";
function qualityColor(q: Quality): string {
  switch (q) {
    case "good": return SAGE;
    case "decent": return AMBER;
    case "bad": return ROSE;
    default: return MUTED;
  }
}

// Threshold-based quality — used for ROAS, CPP, Frequency where there are
// well-known benchmarks.
function qualityFromThreshold(
  value: number,
  thresholds: { good: number; decent: number },
  lowerIsBetter = false,
): Quality {
  if (value === 0) return "neutral";
  if (lowerIsBetter) {
    if (value <= thresholds.good) return "good";
    if (value <= thresholds.decent) return "decent";
    return "bad";
  }
  if (value >= thresholds.good) return "good";
  if (value >= thresholds.decent) return "decent";
  return "bad";
}

// Frequency has a sweet spot at 3–4x: a few exposures helps recall, more than
// that risks fatigue. Below 3 = under-exposed (decent), 3–4 = ideal (good),
// above 4 = over-saturated (bad).
function qualityFromFrequency(freq: number): Quality {
  if (freq === 0) return "neutral";
  if (freq < 3) return "decent";
  if (freq <= 4) return "good";
  return "bad";
}

// Intra-window trend — compares the LAST day in the series to the day before
// it. Three-state color:
//   • > 2% move in the good direction → green
//   • > 2% move in the bad direction  → red
//   • within ±2% (effectively flat)   → amber ("decent")
// "lowerIsBetter" flips the color (e.g. rising CPP = bad).
function intraWindowTrend(
  series: DailyPoint[],
  lowerIsBetter = false,
): { arrow: string; color: string; quality: Quality; pctChange: number } | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].value;
  const prev = series[series.length - 2].value;
  if (last === 0 && prev === 0) return null;
  const change = prev > 0 ? (last - prev) / prev : 0;
  const STABLE = 0.02;
  if (Math.abs(change) < STABLE) {
    // Flat day-over-day → decent (amber)
    return { arrow: "—", color: AMBER, quality: "decent", pctChange: change };
  }
  const rising = last > prev;
  const good = lowerIsBetter ? !rising : rising;
  return {
    arrow: rising ? "↑" : "↓",
    color: good ? SAGE : ROSE,
    quality: good ? "good" : "bad",
    pctChange: change,
  };
}

// Combine an absolute-value quality with a day-over-day trend. The trend
// direction drives the color when it's non-flat: rising in a bad direction
// (e.g. ↑ CPP, ↑ Spend, ↓ ROAS) → RED, and falling in a good direction
// (e.g. ↓ CPP, ↑ Purchases) → GREEN. A flat trend (within ±2%) doesn't
// override — the card falls back to whatever the absolute value says.
// Worst-of-two: a "bad" signal in EITHER dimension wins. So a Spend card with
// good trend (falling) but bad absolute (over budget) stays RED — the trend
// can't mask the fact that you're over your daily limit. Neutral is "no
// opinion" — the other side wins.
function combineQuality(absolute: Quality, trend: Quality | null): Quality {
  if (absolute === "neutral") return trend ?? "neutral";
  if (trend === null) return absolute;
  const rank: Record<Quality, number> = { good: 0, decent: 1, bad: 2, neutral: -1 };
  return rank[absolute] >= rank[trend] ? absolute : trend;
}

// Trading-chart-style mini line chart with optional horizontal reference
// line (budget). Used for the Spend card. SVG-based so the line/dots scale
// crisply and the budget overlay aligns precisely with the data line.
function InlineLineSpark({
  points,
  color,
  formatter,
  referenceLine,
}: {
  points: DailyPoint[];
  color: string;
  formatter: (n: number) => string;
  referenceLine?: { value: number; label?: string };
}) {
  const values = points.map((p) => p.value);
  if (referenceLine) values.push(referenceLine.value);
  const max = Math.max(1, ...values);
  // Chart geometry: 130×40 plot area, padding so first/last dots don't clip
  const W = 130;
  const H = 40;
  const PAD = 18;
  const innerW = W - 2 * PAD;
  const xs = points.map((_, i) =>
    points.length > 1 ? PAD + (i / (points.length - 1)) * innerW : W / 2,
  );
  const ys = points.map((p) => H - (p.value / max) * H);
  const refY = referenceLine ? H - (referenceLine.value / max) * H : 0;
  // Gradient for the area under the line
  const linePath = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`).join(" ");
  const areaPath = `M ${xs[0]} ${H} ${linePath.replace("M", "L")} L ${xs[xs.length - 1]} ${H} Z`;
  const gradientId = `spark-grad-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div className="relative" style={{ width: W }}>
      {/* Value labels above each point */}
      <div className="relative" style={{ height: 14 }}>
        {points.map((p, i) => (
          <span
            key={p.date}
            className="absolute text-[10px] font-semibold tabular-nums leading-none"
            style={{
              left: xs[i],
              transform: "translateX(-50%)",
              top: 0,
              color: INK,
              whiteSpace: "nowrap",
            }}
          >
            {formatter(p.value)}
          </span>
        ))}
      </div>
      {/* SVG line chart */}
      <svg width={W} height={H} style={{ display: "block" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {referenceLine && (
          <line
            x1={0}
            y1={refY}
            x2={W}
            y2={refY}
            strokeDasharray="3 3"
            stroke={INK}
            strokeWidth={1}
            opacity={0.55}
          />
        )}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r={3} fill={color} stroke="white" strokeWidth={1.5} />
        ))}
        {referenceLine && (
          <text
            x={W - 3}
            y={refY - 3}
            textAnchor="end"
            fontSize="8"
            fontWeight="700"
            fill={INK}
            opacity={0.7}
          >
            {referenceLine.label ?? "budget"}
          </text>
        )}
      </svg>
      {/* Date labels below each point */}
      <div className="relative" style={{ height: 12, marginTop: 2 }}>
        {points.map((p, i) => (
          <span
            key={p.date}
            className="absolute text-[9px] leading-none"
            style={{
              left: xs[i],
              transform: "translateX(-50%)",
              top: 0,
              color: MUTED,
              whiteSpace: "nowrap",
            }}
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Inline sparkline laid out horizontally: 3 bars + values above + dates below.
// Optionally overlays a dashed horizontal "budget" line. Bars get a subtle
// vertical gradient and rounded tops. When a budget reference is set, each
// bar is colored by whether it overshot the budget (rose) or stayed under
// it (sage) — quick visual scan of per-day performance.
function InlineSpark({
  points,
  color,
  formatter,
  referenceLine,
}: {
  points: DailyPoint[];
  color: string;
  formatter: (n: number) => string;
  referenceLine?: { value: number; label?: string };
}) {
  const values = points.map((p) => p.value);
  if (referenceLine) values.push(referenceLine.value);
  const max = Math.max(1, ...values);
  // Chart geometry — slightly taller bars + more padding for a cleaner look
  const BAR_AREA = 44; // px tall for the bar canvas
  const LABEL_BOTTOM = 16; // space below bars for date labels
  // Position of the reference line measured from the container bottom.
  const refBottom = referenceLine ? LABEL_BOTTOM + (referenceLine.value / max) * BAR_AREA : 0;
  // Pick a per-bar tint when budget is set: above plan = rose, under = sage.
  // Without a reference, fall back to the card's quality color.
  const barColor = (val: number): string => {
    if (!referenceLine) return color;
    if (val > referenceLine.value) return ROSE;
    return SAGE;
  };
  return (
    <div
      className="relative rounded-lg px-2 pt-1 pb-1.5"
      style={{
        background: "rgba(255, 255, 255, 0.5)",
        border: `1px solid ${BORDER}`,
        minWidth: 140,
      }}
    >
      <div className="flex items-end gap-2.5">
        {points.map((p) => {
          const h = max > 0 ? Math.max(8, (p.value / max) * BAR_AREA) : 8;
          const bc = barColor(p.value);
          return (
            <div key={p.date} className="flex flex-col items-center min-w-[38px]">
              <span
                className="text-[10px] font-semibold tabular-nums leading-none mb-1"
                style={{ color: INK }}
              >
                {formatter(p.value)}
              </span>
              <div
                className="w-9 rounded-t-md"
                style={{
                  height: `${h}px`,
                  background: `linear-gradient(180deg, ${bc} 0%, ${bc}cc 65%, ${bc}99 100%)`,
                  boxShadow: `inset 0 -1px 0 ${bc}33, 0 1px 1px rgba(0,0,0,0.04)`,
                }}
                title={`${p.label}: ${formatter(p.value)}`}
              />
              <span className="text-[9px] mt-1.5" style={{ color: MUTED }}>{p.label}</span>
            </div>
          );
        })}
      </div>
      {referenceLine && (
        <div
          className="absolute left-2 right-2 pointer-events-none"
          style={{ bottom: `${refBottom}px` }}
        >
          {/* Dashed line itself */}
          <div
            className="border-t border-dashed"
            style={{ borderColor: INK, opacity: 0.55 }}
          />
          {/* Inline value pill on the right end */}
          <span
            className="absolute right-0 px-1.5 py-[1px] text-[8px] font-bold rounded-full leading-none whitespace-nowrap shadow-sm"
            style={{
              top: -7,
              background: "white",
              color: INK,
              border: `1px solid ${INK}55`,
            }}
            title={`Daily budget: ${formatter(referenceLine.value)}`}
          >
            ◇ {formatter(referenceLine.value)}
          </span>
        </div>
      )}
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  caption: string;
  delta?: { text: string; color: string };
  quality: Quality;
  series: DailyPoint[];
  formatter: (n: number) => string;
  // Optional horizontal reference line on the sparkline. Used by the Spend
  // card to overlay the daily budget so it's visible per-bar whether you
  // went over or under each day.
  referenceLine?: { value: number; label?: string };
  // "bar" (default) for short tally-style sparks, "line" for trading-style
  // line chart with area fill — used on Spend where the day-to-day trend
  // matters more than absolute values.
  chartType?: "bar" | "line";
  // Small directional arrow + day-over-day percentage. Color is green when the
  // movement is in the metric's "good" direction, red when bad, amber if flat.
  trendArrow?: { arrow: string; color: string; pctChange?: number } | null;
};

function MetricCard({ label, value, caption, delta, quality, series, formatter, referenceLine, chartType = "bar", trendArrow }: MetricCardProps) {
  const color = qualityColor(quality);
  const bg =
    quality === "good" ? `${SAGE}33` :
    quality === "decent" ? `${AMBER}33` :
    quality === "bad" ? `${ROSE}33` :
    CREAM_BG;
  return (
    <div
      className="rounded-xl border p-3 flex items-start justify-between gap-3"
      style={{
        background: bg,
        borderColor: quality === "neutral" ? BORDER : `${color}88`,
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold" style={{ color: MUTED }}>{label}</p>
        <p
          className="text-2xl font-bold tabular-nums mt-0.5 flex items-baseline gap-1.5"
          style={{ color: quality === "bad" ? ROSE : INK }}
        >
          <span>{value}</span>
          {trendArrow && (
            <span
              className="text-sm font-semibold leading-none flex items-baseline gap-0.5"
              style={{ color: trendArrow.color }}
              title="day-over-day vs previous day"
            >
              <span className="text-base">{trendArrow.arrow}</span>
              {trendArrow.pctChange !== undefined && (
                <span className="tabular-nums">
                  {trendArrow.pctChange > 0 ? "+" : ""}
                  {(trendArrow.pctChange * 100).toFixed(0)}%
                </span>
              )}
            </span>
          )}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>{caption}</p>
        {delta && (
          <p className="text-[11px] font-semibold mt-0.5" style={{ color: delta.color }}>
            {delta.text}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {chartType === "line" ? (
          <InlineLineSpark points={series} color={color} formatter={formatter} referenceLine={referenceLine} />
        ) : (
          <InlineSpark points={series} color={color} formatter={formatter} referenceLine={referenceLine} />
        )}
      </div>
    </div>
  );
}

function TagChip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${color}22`, color }}>
      {children}
    </span>
  );
}

export function MetaTrendsCampaigns() {
  const [days] = useState(3);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  // Default to first campaign once data lands; no "all campaigns" option.
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/meta/trends/campaigns?days=${days}`)
      .then((r) => r.json())
      .then((d: ApiResp) => {
        if (cancel) return;
        setData(d);
        // Pick the first campaign if nothing is selected or the previous
        // selection no longer exists in the new dataset.
        setSelected((cur) => {
          if (d.campaigns.length === 0) return "";
          if (cur && d.campaigns.some((c) => c.name === cur)) return cur;
          return d.campaigns[0].name;
        });
        setLoading(false);
      })
      .catch(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [days]);

  const campaignOptions = useMemo(() => {
    if (!data) return [] as string[];
    return [...data.campaigns.map((c) => c.name)];
  }, [data]);

  const visibleCampaigns = useMemo(() => {
    if (!data || !selected) return [] as Campaign[];
    return data.campaigns.filter((c) => c.name === selected);
  }, [data, selected]);

  if (loading) {
    return (
      <div className="rounded-2xl border p-12 text-center text-sm italic" style={{ background: "white", borderColor: BORDER, color: MUTED }}>
        Loading trends…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: INK }}>Waterful — Meta Ads</h1>
        <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>
          Last {data.days} days · {data.window.from} – {data.window.to}
        </p>
      </div>

      {/* Alerts — always visible. Shows "All clear" when nothing is firing. */}
      <div
        className="rounded-xl border p-3 flex flex-wrap items-center gap-2"
        style={{
          background: data.alerts.length === 0 ? `${SAGE}10` : `${AMBER}10`,
          borderColor: data.alerts.length === 0 ? `${SAGE}55` : `${AMBER}55`,
        }}
      >
        <span className="flex items-center gap-1.5 font-semibold text-[12px]" style={{ color: INK }}>
          <Bell size={14} />
          {data.alerts.length === 0 ? "All clear" : "Needs attention"}
        </span>
        {data.alerts.length === 0 ? (
          <span className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={{ background: SAGE, color: "white" }}>
            No critical issues across {data.campaigns.length} campaign{data.campaigns.length === 1 ? "" : "s"}
          </span>
        ) : (
          data.alerts.map((a, i) => {
            const color = a.tone === "red" ? ROSE : a.tone === "amber" ? AMBER : SAGE;
            return (
              <span key={i} className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={{ background: color, color: "white" }}>
                {a.text}
              </span>
            );
          })
        )}
      </div>

      {/* Campaign selector */}
      <div className="flex items-center gap-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider shrink-0" style={{ color: MUTED }}>
          Campaign
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          style={{ borderColor: BORDER, color: INK, background: "white" }}
        >
          {campaignOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {visibleCampaigns.length === 0 && (
        <div className="rounded-2xl border p-12 text-center text-sm italic" style={{ background: "white", borderColor: BORDER, color: MUTED }}>
          No campaign activity in this window.
        </div>
      )}

      {visibleCampaigns.map((c) => (
        <CampaignBlock key={c.metaCampaignId} campaign={c} />
      ))}

      <MetricGuide />
    </div>
  );
}

function CampaignBlock({ campaign }: { campaign: Campaign }) {
  const c = campaign;
  const accent =
    c.tags.kind === "Scaling" ? BLUE :
    c.tags.kind === "Testing" ? SAGE :
    MUTED;

  const fmtInr = (n: number) => formatInr(n);
  const fmtRoas = (n: number) => `${n.toFixed(2)}`;
  // Keep precision for CPP — values often fall in the Rs.500–Rs.2000 range
  // where rounding to "1K" hides real day-over-day variation.
  const fmtCpp = (n: number) => {
    if (n <= 0) return "—";
    if (n < 1000) return `${Math.round(n)}`;
    return `${(n / 1000).toFixed(1)}K`;
  };
  const fmtFreq = (n: number) => `${n.toFixed(2)}`;
  const fmtNum = (n: number) => formatNum(n);

  // Headline shows the LATEST day's spend (matches the last sparkline bar).
  const latestSpend = c.series.spend[c.series.spend.length - 1]?.value ?? 0;
  const latestLabel = c.series.spend[c.series.spend.length - 1]?.label ?? "";
  // Fixed Rs.15K/day target for all campaigns (manual override per user).
  // Simple binary rule: over budget = red, within budget = green.
  const plannedDaily = 15000;
  const budgetUtil = Math.round((latestSpend / plannedDaily) * 100);
  const spendCaption = `${budgetUtil}% of Rs.${formatNum(plannedDaily)} daily budget`;
  const spendAbsoluteQuality: Quality =
    latestSpend === 0 ? "neutral" : latestSpend > plannedDaily ? "bad" : "good";

  return (
    <section className="space-y-3">
      {/* Title + tags row */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <h2 className="text-base font-bold" style={{ color: INK }}>{c.name}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1 -mt-2">
        {(() => {
          const s = c.status?.toUpperCase();
          const info =
            s === "ACTIVE" ? { label: "Running", color: SAGE, dot: SAGE } :
            s === "PAUSED" ? { label: "Paused", color: AMBER, dot: AMBER } :
            s === "DELETED" || s === "ARCHIVED" ? { label: "Deactivated", color: ROSE, dot: ROSE } :
            { label: s ?? "Unknown", color: MUTED, dot: MUTED };
          return (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: `${info.color}22`, color: info.color }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: info.dot }} />
              {info.label}
            </span>
          );
        })()}
        {c.tags.buyingType && (
          <TagChip color={BLUE}>
            {c.tags.buyingType}
            {c.tags.advantagePlus && " · Advantage+"}
          </TagChip>
        )}
        {c.tags.kind && <TagChip color={accent}>{c.tags.kind}</TagChip>}
        <span className="text-[11px]" style={{ color: MUTED }}>
          {c.adSetsCount} ad sets · {c.adsCount} ads
        </span>
      </div>

      {/* 3-column grid (2 rows × 3 cols = 6 cards) */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(() => {
          // Pre-compute each card's trend + final quality (absolute combined
          // with trend, so a metric in a "good" absolute range but worsening
          // day-over-day gets degraded to amber/red).
          // Spend: rising = bad (over-spending), falling = good. lowerIsBetter=true.
          const spendTrend = intraWindowTrend(c.series.spend, true);
          const roasTrend = intraWindowTrend(c.series.roas);
          const cppTrend = intraWindowTrend(c.series.cpp, true);
          const purchasesTrend = intraWindowTrend(c.series.purchases);
          const reachTrend = intraWindowTrend(c.series.reach);
          const freqTrend = intraWindowTrend(c.series.frequency, true);
          return (
            <>
              <MetricCard
                label={`Spend · ${latestLabel}`}
                value={formatInr(latestSpend)}
                caption={spendCaption}
                quality={spendAbsoluteQuality}
                series={c.series.spend}
                formatter={fmtInr}
                referenceLine={{ value: plannedDaily, label: "budget" }}
                trendArrow={spendTrend}
              />
              <MetricCard
                label="ROAS"
                value={`${c.current.roas.toFixed(2)}x`}
                caption="Target 1.8–2.5x"
                quality={combineQuality(
                  qualityFromThreshold(c.current.roas, { good: 1.8, decent: 1 }),
                  roasTrend?.quality ?? null,
                )}
                series={c.series.roas}
                formatter={fmtRoas}
                trendArrow={roasTrend}
              />
              <MetricCard
                label="CPP"
                value={c.current.cpp > 0 ? `Rs.${Math.round(c.current.cpp).toLocaleString("en-IN")}` : "—"}
                caption="Target Rs.600–1,500"
                quality={combineQuality(
                  qualityFromThreshold(c.current.cpp, { good: 1500, decent: 2500 }, true),
                  cppTrend?.quality ?? null,
                )}
                series={c.series.cpp}
                formatter={fmtCpp}
                trendArrow={cppTrend}
              />
              <MetricCard
                label="Purchases"
                value={`${c.current.purchases}`}
                caption="No benchmark"
                quality={
                  c.current.purchases === 0
                    ? "neutral"
                    : purchasesTrend?.quality ?? "decent"
                }
                series={c.series.purchases}
                formatter={(n) => `${n}`}
                trendArrow={purchasesTrend}
              />
              <MetricCard
                label="Reach"
                value={formatNum(c.current.reach)}
                caption="Higher is better"
                quality={reachTrend?.quality ?? "decent"}
                series={c.series.reach}
                formatter={fmtNum}
                trendArrow={reachTrend}
              />
              <MetricCard
                label="Frequency"
                value={c.current.frequency.toFixed(2)}
                caption="Sweet spot 3–4x"
                quality={combineQuality(
                  qualityFromFrequency(c.current.frequency),
                  freqTrend?.quality ?? null,
                )}
                series={c.series.frequency}
                formatter={fmtFreq}
                trendArrow={freqTrend}
              />
            </>
          );
        })()}
      </div>
    </section>
  );
}

function MetricGuide() {
  const guides: { title: string; target: string; body: string }[] = [
    { title: "ROAS — Return on ad spend", target: "Target: 1.8–2.5x", body: "Revenue earned for every Rs.1 spent. Below 1x means losing money on ad spend before cost of goods." },
    { title: "CPP — Cost per purchase", target: "Target: Rs.600–Rs.1,500", body: "Total spend divided by purchases. Set your ceiling based on your average order value and margins." },
    { title: "Frequency", target: "Keep below 3–4x per week", body: "Average times one person saw your ad. Above 4x leads to fatigue — CTR drops and CPM rises." },
    { title: "Reach", target: "Higher is better", body: "Unique people who saw your ad. Rising reach with stable frequency means you are finding new audiences." },
    { title: "Daily spend vs budget", target: "Target: 90–100% utilisation", body: "How much of your daily budget Meta is spending. Consistent under-delivery may signal audience or creative constraints." },
    { title: "Purchases", target: "No fixed benchmark", body: "Total conversions in the period. Track alongside ROAS — high volume at low ROAS means scale without profitability." },
  ];
  return (
    <section className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
      <h3 className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: MUTED }}>Metric guide</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {guides.map((g) => (
          <div key={g.title} className="rounded-xl border p-3" style={{ borderColor: BORDER, background: "#fafaf7" }}>
            <p className="font-semibold text-[13px]" style={{ color: INK }}>{g.title}</p>
            <p className="text-[11px] mt-0.5" style={{ color: AMBER }}>{g.target}</p>
            <p className="text-[11px] mt-1.5 leading-snug" style={{ color: MUTED }}>{g.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
