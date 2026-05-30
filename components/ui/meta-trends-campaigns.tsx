"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { targetDailyBudget } from "@/lib/meta-budgets";

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

// Trend-based quality — for metrics with no absolute benchmark
// (Reach, Purchases). For "higher is better", rising = good; flat = decent;
// falling = bad. Inverts for "lower is better".
function qualityFromTrend(
  curr: number,
  prev: number | undefined,
  lowerIsBetter = false,
): Quality {
  if (prev === undefined || prev === 0) return "neutral";
  const d = (curr - prev) / prev;
  if (Math.abs(d) < 0.05) return "decent";
  const rising = d > 0;
  const good = lowerIsBetter ? !rising : rising;
  return good ? "good" : "bad";
}

// Budget-utilization quality — used for Daily spend (when budget is set).
// On-plan = good, slight under/over = decent, way off = bad.
function qualityFromBudgetUtil(util: number | null): Quality {
  if (util == null) return "neutral";
  if (util >= 80 && util <= 110) return "good";
  if ((util >= 60 && util < 80) || (util > 110 && util <= 130)) return "decent";
  return "bad";
}

function pctDelta(curr: number, prev: number | undefined): number | null {
  if (prev === undefined || prev === 0) return null;
  return (curr - prev) / prev;
}

function numericDelta(curr: number, prev: number | undefined, lowerIsBetter = false): { text: string; color: string } {
  const d = pctDelta(curr, prev);
  if (d === null) return { text: "—", color: MUTED };
  const pct = (d * 100).toFixed(0);
  const positive = d >= 0;
  const good = lowerIsBetter ? !positive : positive;
  const color = Math.abs(d) < 0.01 ? MUTED : good ? SAGE : ROSE;
  const arrow = Math.abs(d) < 0.01 ? "—" : positive ? "↑" : "↓";
  return { text: `${arrow} ${positive ? "+" : ""}${pct}% vs prior`, color };
}

// Qualitative trend label (used for Spend and Frequency in this design)
function qualitativeDelta(curr: number, prev: number | undefined, lowerIsBetter = false): { text: string; color: string } {
  const d = pctDelta(curr, prev);
  if (d === null) return { text: "—", color: MUTED };
  if (Math.abs(d) < 0.05) return { text: "— stable", color: MUTED };
  const rising = d > 0;
  const good = lowerIsBetter ? !rising : rising;
  const color = good ? SAGE : ROSE;
  const word = rising ? "rising" : "falling";
  const arrow = rising ? "↑" : "↓";
  return { text: `${arrow} ${word}`, color };
}

// Inline sparkline laid out horizontally: 3 bars + values above + dates below
function InlineSpark({ points, color, formatter }: { points: DailyPoint[]; color: string; formatter: (n: number) => string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="flex items-end gap-2">
      {points.map((p) => {
        const h = max > 0 ? Math.max(8, (p.value / max) * 36) : 8;
        return (
          <div key={p.date} className="flex flex-col items-center min-w-[34px]">
            <span className="text-[10px] font-semibold tabular-nums leading-none mb-1" style={{ color: INK }}>
              {formatter(p.value)}
            </span>
            <div
              className="w-7 rounded-sm"
              style={{ height: `${h}px`, background: color }}
              title={`${p.label}: ${p.value}`}
            />
            <span className="text-[9px] mt-1" style={{ color: MUTED }}>{p.label}</span>
          </div>
        );
      })}
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
};

function MetricCard({ label, value, caption, delta, quality, series, formatter }: MetricCardProps) {
  const color = qualityColor(quality);
  const bg =
    quality === "good" ? `${SAGE}15` :
    quality === "decent" ? `${AMBER}18` :
    quality === "bad" ? `${ROSE}18` :
    CREAM_BG;
  return (
    <div
      className="rounded-xl border p-3 flex items-start justify-between gap-3"
      style={{
        background: bg,
        borderColor: quality === "neutral" ? BORDER : `${color}55`,
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold" style={{ color: MUTED }}>{label}</p>
        <p
          className="text-2xl font-bold tabular-nums mt-0.5"
          style={{ color: quality === "bad" ? ROSE : INK }}
        >
          {value}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>{caption}</p>
        {delta && (
          <p className="text-[11px] font-semibold mt-0.5" style={{ color: delta.color }}>
            {delta.text}
          </p>
        )}
      </div>
      <div className="shrink-0">
        <InlineSpark points={series} color={color} formatter={formatter} />
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
  const [selected, setSelected] = useState<string>("ALL");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/meta/trends/campaigns?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancel) {
          setData(d);
          setLoading(false);
        }
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
    if (!data) return [] as Campaign[];
    if (selected === "ALL") return data.campaigns;
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
          Last {data.days} days · {data.window.from} – {data.window.to} · vs prior {data.days} days {data.priorWindow.from} – {data.priorWindow.to}
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
          <option value="ALL">All campaigns ({campaignOptions.length})</option>
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
  const fmtCpp = (n: number) => (n > 0 ? `${Math.round(n / 1000)}K` : "—");
  const fmtFreq = (n: number) => `${n.toFixed(2)}`;
  const fmtNum = (n: number) => formatNum(n);

  // Total spend over the window vs PLANNED budget (daily × days). The
  // sparkline bars stay daily — only the headline number is cumulative.
  const seriesDays = Math.max(1, c.series.spend.length);
  const plannedDaily = targetDailyBudget(c.name, c.dailyBudget);
  const plannedWindow = plannedDaily ? plannedDaily * seriesDays : null;
  const budgetUtil = plannedWindow && plannedWindow > 0
    ? Math.round((c.current.spend / plannedWindow) * 100)
    : null;
  const spendCaption = plannedWindow && plannedDaily && budgetUtil != null
    ? `${budgetUtil}% of Rs.${formatNum(plannedWindow)} planned (Rs.${formatNum(plannedDaily)}/day × ${seriesDays}d)`
    : c.tags.buyingType === "ABO"
    ? "ABO · sum of ad sets"
    : "—";

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
        <MetricCard
          label={`Spend · ${seriesDays}d`}
          value={formatInr(c.current.spend)}
          caption={spendCaption}
          delta={qualitativeDelta(c.current.spend, c.previous?.spend)}
          quality={qualityFromBudgetUtil(budgetUtil)}
          series={c.series.spend}
          formatter={fmtInr}
        />
        <MetricCard
          label="ROAS"
          value={`${c.current.roas.toFixed(2)}x`}
          caption="Target 1.8–2.5x"
          delta={numericDelta(c.current.roas, c.previous?.roas)}
          quality={qualityFromThreshold(c.current.roas, { good: 1.8, decent: 1 })}
          series={c.series.roas}
          formatter={fmtRoas}
        />
        <MetricCard
          label="CPP"
          value={c.current.cpp > 0 ? `Rs.${Math.round(c.current.cpp).toLocaleString("en-IN")}` : "—"}
          caption="Target Rs.600–1,500"
          delta={numericDelta(c.current.cpp, c.previous?.cpp, true)}
          quality={qualityFromThreshold(c.current.cpp, { good: 1500, decent: 2500 }, true)}
          series={c.series.cpp}
          formatter={fmtCpp}
        />
        <MetricCard
          label="Purchases"
          value={`${c.current.purchases}`}
          caption="No benchmark"
          delta={numericDelta(c.current.purchases, c.previous?.purchases)}
          quality={qualityFromTrend(c.current.purchases, c.previous?.purchases)}
          series={c.series.purchases}
          formatter={(n) => `${n}`}
        />
        <MetricCard
          label="Reach"
          value={formatNum(c.current.reach)}
          caption="Higher is better"
          delta={numericDelta(c.current.reach, c.previous?.reach)}
          quality={qualityFromTrend(c.current.reach, c.previous?.reach)}
          series={c.series.reach}
          formatter={fmtNum}
        />
        <MetricCard
          label="Frequency"
          value={c.current.frequency.toFixed(2)}
          caption="Keep below 3–4x"
          delta={qualitativeDelta(c.current.frequency, c.previous?.frequency, true)}
          quality={qualityFromThreshold(c.current.frequency, { good: 2, decent: 3 }, true)}
          series={c.series.frequency}
          formatter={fmtFreq}
        />
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
