"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, FolderTree, ChevronRight } from "lucide-react";

const INK = "#ffffff";
const MUTED = "#9ca3af";
const AMBER = "#22c5ff";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const BORDER = "#e7d9c1";
const BLUE = "#7c8bb2";
const CREAM_BG = "#0a0a0a";

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

type AdSet = {
  metaAdSetId: string;
  name: string;
  status: string;
  metaCampaignId: string;
  campaignName: string;
  dailyBudget: number | null;
  campaignDailyBudget: number | null;
  adsCount: number;
  tags: Tags;
  current: {
    spend: number;
    purchases: number;
    purchaseValue: number;
    impressions: number;
    clicks: number;
    reach: number;
    roas: number;
    cpp: number;
    ctr: number;
    frequency: number;
  };
  previous: AdSet["current"] | null;
  series: {
    spend: DailyPoint[];
    roas: DailyPoint[];
    cpp: DailyPoint[];
    purchases: DailyPoint[];
    ctr: DailyPoint[];
    frequency: DailyPoint[];
  };
};

type ApiResp = {
  days: number;
  window: { from: string; to: string };
  priorWindow: { from: string; to: string };
  adSets: AdSet[];
  budgetSummary: {
    totalDailyBudget: number;
    cbosBudget: number;
    cbosWithBudget: number;
    abosBudget: number;
    abosWithBudget: number;
    yesterdaySpend: number;
    yesterdayDate: string;
    utilization: number;
    headroom: number;
  };
};

type Quality = "good" | "decent" | "bad" | "neutral";
function qualityColor(q: Quality): string {
  switch (q) {
    case "good": return SAGE;
    case "decent": return AMBER;
    case "bad": return ROSE;
    default: return MUTED;
  }
}
function qualityFromThreshold(value: number, thresholds: { good: number; decent: number }, lowerIsBetter = false): Quality {
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
function qualityFromBudgetUtil(util: number | null): Quality {
  if (util == null) return "neutral";
  if (util >= 80 && util <= 110) return "good";
  if ((util >= 60 && util < 80) || (util > 110 && util <= 130)) return "decent";
  return "bad";
}

// Frequency sweet spot: <3 = under-exposed (decent), 3–4 = ideal (good),
// >4 = over-saturated (bad).
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
// → RED, falling in a good direction → GREEN. A flat trend doesn't override.
// Worst-of-two: bad signal in either dimension wins. Neutral = no opinion.
function combineQuality(absolute: Quality, trend: Quality | null): Quality {
  if (absolute === "neutral") return trend ?? "neutral";
  if (trend === null) return absolute;
  const rank: Record<Quality, number> = { good: 0, decent: 1, bad: 2, neutral: -1 };
  return rank[absolute] >= rank[trend] ? absolute : trend;
}

// Inline sparkline laid out horizontally: bars + values above + dates below.
// Optionally overlays a dashed horizontal "budget" reference line. Bars get a
// subtle vertical gradient and rounded tops. When a budget reference is set,
// each bar is colored by whether it overshot (rose) or stayed under (sage).
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
  const BAR_AREA = 44;
  const LABEL_BOTTOM = 16;
  const refBottom = referenceLine ? LABEL_BOTTOM + (referenceLine.value / max) * BAR_AREA : 0;
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
          <div className="border-t border-dashed" style={{ borderColor: INK, opacity: 0.55 }} />
          <span
            className="absolute right-0 px-1.5 py-[1px] text-[8px] font-bold rounded-full leading-none whitespace-nowrap shadow-sm"
            style={{
              top: -7,
              background: "#0a0a0a",
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
  referenceLine?: { value: number; label?: string };
  trendArrow?: { arrow: string; color: string; pctChange?: number } | null;
};

function MetricCard({ label, value, caption, delta, quality, series, formatter, referenceLine, trendArrow }: MetricCardProps) {
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
        {delta && <p className="text-[11px] font-semibold mt-0.5" style={{ color: delta.color }}>{delta.text}</p>}
      </div>
      <div className="shrink-0">
        <InlineSpark points={series} color={color} formatter={formatter} referenceLine={referenceLine} />
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

export function MetaTrendsAdSets() {
  const [days] = useState(3);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [adSetFilter, setAdSetFilter] = useState<string>("");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/meta/trends/ad-sets?days=${days}`)
      .then((r) => r.json())
      .then((d: ApiResp) => {
        if (cancel) return;
        setData(d);
        // Default to first campaign + its first SPENDING ad set
        if (d.adSets.length > 0) {
          const firstCampaign = d.adSets[0].metaCampaignId;
          setCampaignFilter(firstCampaign);
          const firstAdSetInCampaign = d.adSets.find(
            (s) => s.metaCampaignId === firstCampaign && s.current.spend > 0,
          );
          if (firstAdSetInCampaign) setAdSetFilter(firstAdSetInCampaign.metaAdSetId);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [days]);

  // Unique campaigns from the ad-set data
  const campaigns = useMemo(() => {
    if (!data) return [] as { id: string; name: string }[];
    const map = new Map<string, string>();
    for (const s of data.adSets) {
      if (!map.has(s.metaCampaignId)) map.set(s.metaCampaignId, s.campaignName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Ad sets in the chosen campaign — only those that actually spent in the
  // window. Zero-spend ad-sets are paused/inactive noise and clutter the picker.
  const adSetsInCampaign = useMemo(() => {
    if (!data || !campaignFilter) return [] as AdSet[];
    return data.adSets.filter(
      (s) => s.metaCampaignId === campaignFilter && s.current.spend > 0,
    );
  }, [data, campaignFilter]);

  // The selected ad set
  const selected = useMemo(() => {
    if (!adSetFilter) return null;
    return adSetsInCampaign.find((s) => s.metaAdSetId === adSetFilter) ?? null;
  }, [adSetsInCampaign, adSetFilter]);

  // Switching campaign should auto-pick the first ad set within it
  useEffect(() => {
    if (!data || !campaignFilter) return;
    const stillValid = adSetsInCampaign.some((s) => s.metaAdSetId === adSetFilter);
    if (!stillValid && adSetsInCampaign.length > 0) {
      setAdSetFilter(adSetsInCampaign[0].metaAdSetId);
    }
  }, [data, campaignFilter, adSetsInCampaign, adSetFilter]);

  // Alerts for the SELECTED ad set
  const alerts = useMemo(() => {
    if (!selected) return [] as { tone: "red" | "amber" | "green"; text: string }[];
    const out: { tone: "red" | "amber" | "green"; text: string }[] = [];
    const cur = selected.current;
    const prev = selected.previous;
    if (cur.roas > 0 && cur.roas < 1 && cur.spend > 1000) {
      out.push({ tone: "red", text: `ROAS ${cur.roas.toFixed(2)}x (losing money)` });
    } else if (prev && prev.roas > 0) {
      const d = (cur.roas - prev.roas) / prev.roas;
      if (cur.roas < 1.5 && d < 0) {
        out.push({ tone: "amber", text: `ROAS below target — ${cur.roas.toFixed(2)}x and declining` });
      } else if (d <= -0.3) {
        out.push({ tone: "red", text: `ROAS ${cur.roas.toFixed(2)}x (${(d * 100).toFixed(0)}% vs prior)` });
      }
    }
    if (cur.cpp > 2500 && cur.purchases > 0) {
      out.push({ tone: "red", text: `CPP Rs.${Math.round(cur.cpp).toLocaleString("en-IN")} (above ceiling)` });
    }
    if (cur.frequency > 3) {
      out.push({ tone: "amber", text: `Frequency ${cur.frequency.toFixed(1)}x (above threshold)` });
    }
    if (cur.ctr < 1 && cur.impressions > 1000) {
      out.push({ tone: "amber", text: `CTR ${cur.ctr.toFixed(2)}% (below 1.5% target)` });
    }
    return out;
  }, [selected]);

  if (loading) {
    return (
      <div className="rounded-2xl border p-12 text-center text-sm italic" style={{ background: "#0a0a0a", borderColor: BORDER, color: MUTED }}>
        Loading trends…
      </div>
    );
  }
  if (!data) return null;

  const accent =
    selected?.tags.kind === "Scaling" ? BLUE :
    selected?.tags.kind === "Testing" ? SAGE :
    MUTED;

  // Use Meta's actual budget directly. Prefer the ad-set's own daily budget
  // (ABO); fall back to the parent campaign's daily budget (CBO). No manual
  // overrides — single source of truth is Meta's API.
  const plannedDaily = selected
    ? selected.dailyBudget && selected.dailyBudget > 0
      ? selected.dailyBudget
      : selected.campaignDailyBudget && selected.campaignDailyBudget > 0
      ? selected.campaignDailyBudget
      : null
    : null;
  const budgetSource: "adset" | "campaign" | null = selected
    ? selected.dailyBudget && selected.dailyBudget > 0
      ? "adset"
      : plannedDaily
      ? "campaign"
      : null
    : null;
  // Headline shows the LATEST day's spend (matches the last sparkline bar).
  const latestSpend = selected?.series.spend[selected.series.spend.length - 1]?.value ?? 0;
  const latestLabel = selected?.series.spend[selected.series.spend.length - 1]?.label ?? "";
  const budgetUtil = plannedDaily && plannedDaily > 0
    ? Math.round((latestSpend / plannedDaily) * 100)
    : null;
  const spendCaption = plannedDaily && budgetUtil != null
    ? `${budgetUtil}% of Rs.${formatNum(plannedDaily)} daily budget${budgetSource === "campaign" ? " · CBO cap" : ""}`
    : "No budget configured";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: INK }}>Waterful — Meta Ads · Ad Sets</h1>
        <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>
          Last {data.days} days · {data.window.from} – {data.window.to} · vs prior {data.days} days {data.priorWindow.from} – {data.priorWindow.to}
        </p>
      </div>

      {/* Budget headroom — total daily cap vs yesterday's spend */}
      {(() => {
        const b = data.budgetSummary;
        const util = Math.max(0, Math.min(100, b.utilization));
        const utilColor = util >= 95 ? ROSE : util >= 60 ? AMBER : SAGE;
        const hint =
          util >= 95 ? "near cap — algorithm bidding aggressively"
          : util >= 60 ? "healthy utilisation"
          : "lots of unused headroom";
        return (
          <section
            className="rounded-2xl border p-5 shadow-sm"
            style={{ background: "#0a0a0a", borderColor: BORDER }}
          >
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-bold" style={{ color: INK }}>Daily budget headroom</h2>
              <span className="text-[11px] italic" style={{ color: MUTED }}>
                yesterday&rsquo;s spend ({b.yesterdayDate}) vs total active daily caps
              </span>
            </div>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Total daily cap</p>
                <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: INK }}>
                  ₹{b.totalDailyBudget.toLocaleString("en-IN")}
                </p>
                <p className="mt-1 text-[10px]" style={{ color: MUTED }}>
                  {b.cbosWithBudget} CBO (₹{b.cbosBudget.toLocaleString("en-IN")}) + {b.abosWithBudget} ABO (₹{b.abosBudget.toLocaleString("en-IN")})
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Yesterday&rsquo;s spend</p>
                <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: INK }}>
                  ₹{b.yesterdaySpend.toLocaleString("en-IN")}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Utilisation</p>
                <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: utilColor }}>
                  {util.toFixed(0)}%
                </p>
                <p className="mt-1 text-[10px] italic" style={{ color: MUTED }}>{hint}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Headroom left</p>
                <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: INK }}>
                  ₹{b.headroom.toLocaleString("en-IN")}
                </p>
                <p className="mt-1 text-[10px]" style={{ color: MUTED }}>untapped daily capacity</p>
              </div>
            </div>
            <div className="mt-4 h-2 w-full rounded-full overflow-hidden" style={{ background: `${MUTED}18` }}>
              <div className="h-full transition-all" style={{ width: `${util}%`, background: utilColor }} />
            </div>
          </section>
        );
      })()}

      {/* Alerts — always visible */}
      <div
        className="rounded-xl border p-3 flex flex-wrap items-center gap-2"
        style={{
          background: alerts.length === 0 ? `${SAGE}10` : `${AMBER}10`,
          borderColor: alerts.length === 0 ? `${SAGE}55` : `${AMBER}55`,
        }}
      >
        <span className="flex items-center gap-1.5 font-semibold text-[12px]" style={{ color: INK }}>
          <Bell size={14} />
          {alerts.length === 0 ? "All clear" : "Needs attention"}
        </span>
        {alerts.length === 0 ? (
          <span className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={{ background: SAGE, color: "white" }}>
            No critical issues for this ad set
          </span>
        ) : (
          alerts.map((a, i) => {
            const color = a.tone === "red" ? ROSE : a.tone === "amber" ? AMBER : SAGE;
            return (
              <span key={i} className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={{ background: color, color: "white" }}>
                {a.text}
              </span>
            );
          })
        )}
      </div>

      {/* Two dropdowns — Campaign + Ad Set */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Campaign</label>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: "#0a0a0a" }}
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Ad Set</label>
          <select
            value={adSetFilter}
            onChange={(e) => setAdSetFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: "#0a0a0a" }}
          >
            {adSetsInCampaign.map((s) => (
              <option key={s.metaAdSetId} value={s.metaAdSetId}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!selected ? (
        <div className="rounded-2xl border p-12 text-center text-sm italic" style={{ background: "#0a0a0a", borderColor: BORDER, color: MUTED }}>
          No ad-set activity in this window.
        </div>
      ) : (
        <>
          {/* Breadcrumb + tags */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm" style={{ color: INK }}>
              <FolderTree size={14} style={{ color: MUTED }} />
              <span className="font-medium">{selected.campaignName}</span>
              <ChevronRight size={14} style={{ color: MUTED }} />
              <span className="font-medium">{selected.name}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const s = selected.status?.toUpperCase();
                const info =
                  s === "ACTIVE" ? { label: "Running", color: SAGE } :
                  s === "PAUSED" ? { label: "Paused", color: AMBER } :
                  s === "DELETED" || s === "ARCHIVED" ? { label: "Deactivated", color: ROSE } :
                  { label: s ?? "Unknown", color: MUTED };
                return (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${info.color}22`, color: info.color }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: info.color }} />
                    {info.label}
                  </span>
                );
              })()}
              {selected.tags.buyingType && (
                <TagChip color={BLUE}>
                  {selected.tags.buyingType}
                  {selected.tags.advantagePlus && " · Advantage+"}
                </TagChip>
              )}
              {selected.tags.kind && <TagChip color={accent}>{selected.tags.kind}</TagChip>}
              <span className="text-[11px]" style={{ color: MUTED }}>
                {selected.adsCount} ads
              </span>
            </div>
          </div>

          {/* Metric cards — 3 cols × 2 rows = 6 */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(() => {
              const s = selected;
              const spendTrend = intraWindowTrend(s.series.spend, true);
              const roasTrend = intraWindowTrend(s.series.roas);
              const cppTrend = intraWindowTrend(s.series.cpp, true);
              const purchasesTrend = intraWindowTrend(s.series.purchases);
              const ctrTrend = intraWindowTrend(s.series.ctr);
              const freqTrend = intraWindowTrend(s.series.frequency, true);
              const fmtCpp = (n: number) => {
                if (n <= 0) return "—";
                if (n < 1000) return `${Math.round(n)}`;
                return `${(n / 1000).toFixed(1)}K`;
              };
              return (
                <>
                  <MetricCard
                    label={`Spend · ${latestLabel}`}
                    value={formatInr(latestSpend)}
                    caption={spendCaption}
                    quality={combineQuality(
                      qualityFromBudgetUtil(budgetUtil),
                      spendTrend?.quality ?? null,
                    )}
                    series={s.series.spend}
                    formatter={(n) => formatInr(n)}
                    referenceLine={plannedDaily ? { value: plannedDaily, label: "budget" } : undefined}
                    trendArrow={spendTrend}
                  />
                  {(() => {
                    // All cards show LATEST day's value (matches the last bar).
                    const lastV = <T extends { value: number }>(arr: T[]) => arr[arr.length - 1]?.value ?? 0;
                    const latestRoas = lastV(s.series.roas);
                    const latestCpp = lastV(s.series.cpp);
                    const latestPurchases = lastV(s.series.purchases);
                    const latestCtr = lastV(s.series.ctr);
                    const latestFreq = lastV(s.series.frequency);
                    return (
                      <>
                        <MetricCard
                          label="ROAS"
                          value={`${latestRoas.toFixed(2)}x`}
                          caption="Target 1.8–2.5x"
                          quality={combineQuality(
                            qualityFromThreshold(latestRoas, { good: 1.8, decent: 1 }),
                            roasTrend?.quality ?? null,
                          )}
                          series={s.series.roas}
                          formatter={(n) => n.toFixed(2)}
                          trendArrow={roasTrend}
                        />
                        <MetricCard
                          label="CPP"
                          value={latestCpp > 0 ? `Rs.${Math.round(latestCpp).toLocaleString("en-IN")}` : "—"}
                          caption="Target Rs.600–1,500"
                          quality={combineQuality(
                            qualityFromThreshold(latestCpp, { good: 1500, decent: 2500 }, true),
                            cppTrend?.quality ?? null,
                          )}
                          series={s.series.cpp}
                          formatter={fmtCpp}
                          trendArrow={cppTrend}
                        />
                        <MetricCard
                          label="Purchases"
                          value={`${latestPurchases}`}
                          caption="No benchmark"
                          quality={
                            latestPurchases === 0
                              ? "neutral"
                              : purchasesTrend?.quality ?? "decent"
                          }
                          series={s.series.purchases}
                          formatter={(n) => `${n}`}
                          trendArrow={purchasesTrend}
                        />
                        <MetricCard
                          label="CTR"
                          value={`${latestCtr.toFixed(2)}%`}
                          caption="Target 1.5–2%+"
                          quality={combineQuality(
                            qualityFromThreshold(latestCtr, { good: 1.5, decent: 1 }),
                            ctrTrend?.quality ?? null,
                          )}
                          series={s.series.ctr}
                          formatter={(n) => `${n.toFixed(2)}`}
                          trendArrow={ctrTrend}
                        />
                        <MetricCard
                          label="Frequency"
                          value={latestFreq.toFixed(2)}
                          caption="Sweet spot 3–4x"
                          quality={combineQuality(
                            qualityFromFrequency(latestFreq),
                            freqTrend?.quality ?? null,
                          )}
                          series={s.series.frequency}
                          formatter={(n) => n.toFixed(2)}
                          trendArrow={freqTrend}
                        />
                      </>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* Metric Guide */}
      <MetricGuide />
    </div>
  );
}

function MetricGuide() {
  const guides = [
    { title: "ROAS — Return on ad spend", target: "Target: 1.8–2.5x", body: "Revenue earned for every Rs.1 spent. Below 1x means losing money on ad spend before cost of goods." },
    { title: "CPP — Cost per purchase", target: "Target: Rs.600–Rs.1,500", body: "Total spend divided by purchases. Set your ceiling based on your average order value and margins." },
    { title: "CTR — Click-through rate", target: "Target: 1.5–2%+", body: "Percentage of people who clicked after seeing the ad. The primary signal of how compelling the creative is." },
    { title: "Frequency", target: "Keep below 3–4x per week", body: "Average times one person saw your ad. Watch alongside CTR — rising frequency with falling CTR signals fatigue." },
    { title: "Spend vs budget", target: "Target: 90–100% utilisation", body: "How much of the ad-set budget Meta is spending. Under-delivery may mean the audience is too narrow or bid is too low." },
    { title: "Purchases", target: "No fixed benchmark", body: "Total conversions from this ad set. Rising purchases with improving ROAS is the signal a batch is ready to scale." },
  ];
  return (
    <section className="rounded-2xl border p-5 shadow-sm" style={{ background: "#0a0a0a", borderColor: BORDER }}>
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
