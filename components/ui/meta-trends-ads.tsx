"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, FolderTree, ChevronRight } from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const BORDER = "#e7d9c1";
const VIOLET = "#8b7cb2";
const CREAM_BG = "#faf6ef";

function formatInr(v: number) {
  if (v >= 100000) return `Rs.${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `Rs.${(v / 1000).toFixed(1)}K`;
  return `Rs.${Math.round(v).toLocaleString("en-IN")}`;
}
// Normalize Meta's free-text creative_type (image, video, share, dco, etc.)
// into our three buckets used by the format filter.
function normalizeFormat(t: string | null): "video" | "image" | "carousel" {
  if (!t) return "image";
  const lower = t.toLowerCase();
  if (lower.includes("video") || lower.includes("reel")) return "video";
  if (lower.includes("carousel")) return "carousel";
  return "image";
}

type Ad = {
  metaAdId: string;
  name: string;
  status: string;
  creativeType: string | null;
  thumbnailUrl: string | null;
  previewLink: string | null;
  adSetName: string;
  campaignName: string;
  adSetDailyBudget: number | null;
  campaignDailyBudget: number | null;
  metaAdSetId: string;
  metaCampaignId: string;
  current: {
    spend: number;
    impressions: number;
    clicks: number;
    purchases: number;
    purchaseValue: number;
    addToCart: number;
    initiateCheckout: number;
    landingPageViews: number;
    video3sViews: number;
    video25pViews: number;
    video50pViews: number;
    videoP75Views: number;
    video100pViews: number;
    frequency: number;
    cpm: number;
    cpc: number;
    ctr: number;
    cpp: number;
    roas: number;
    hookRate: number;
    holdRate: number;
  };
  previous: Ad["current"] | null;
  series: {
    spend: DailyPoint[];
    roas: DailyPoint[];
    cpp: DailyPoint[];
    purchases: DailyPoint[];
    purchaseValue: DailyPoint[];
    ctr: DailyPoint[];
    cpm: DailyPoint[];
    cpc: DailyPoint[];
    frequency: DailyPoint[];
  };
};

type DailyPoint = { date: string; label: string; value: number };

type ApiResp = {
  days: number;
  window: { from: string; to: string };
  priorWindow: { from: string; to: string };
  ads: Ad[];
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

// Intra-window day-over-day trend (last point vs second-to-last). 2% stable
// zone; lowerIsBetter flips the color for metrics where falling is good.
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

// Combine absolute quality with a day-over-day trend. The trend direction
// drives the color when non-flat: bad trend → RED, good trend → GREEN. Flat
// trend (within ±2%) falls back to the absolute. Same as Campaigns + Ad Sets.
// Worst-of-two: bad signal in either dimension wins. Neutral = no opinion.
function combineQuality(absolute: Quality, trend: Quality | null): Quality {
  if (absolute === "neutral") return trend ?? "neutral";
  if (trend === null) return absolute;
  const rank: Record<Quality, number> = { good: 0, decent: 1, bad: 2, neutral: -1 };
  return rank[absolute] >= rank[trend] ? absolute : trend;
}

// Inline sparkline matching the Campaigns / Ad Sets style: bordered panel,
// gradient bars with rounded tops, value above + date below each bar. Spark
// sits to the RIGHT of the value/caption (horizontal card layout). Optional
// horizontal dashed reference line — used by the Spend card to overlay the
// parent ad-set / campaign daily budget so the user can scan per-day pacing.
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
    return val > referenceLine.value ? ROSE : SAGE;
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

function MiniMetric({
  label,
  value,
  caption,
  quality,
  series,
  sparkFormatter,
  trendArrow,
  referenceLine,
}: {
  label: string;
  value: string;
  caption: { text: string; color?: string } | null;
  quality: Quality;
  series?: DailyPoint[];
  sparkFormatter?: (n: number) => string;
  trendArrow?: { arrow: string; color: string; pctChange?: number } | null;
  referenceLine?: { value: number; label?: string };
}) {
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
        {caption && (
          <p className="text-[11px] font-semibold mt-0.5" style={{ color: caption.color ?? MUTED }}>
            {caption.text}
          </p>
        )}
      </div>
      {series && sparkFormatter && (
        <div className="shrink-0">
          <InlineSpark
            points={series}
            color={color}
            formatter={sparkFormatter}
            referenceLine={referenceLine}
          />
        </div>
      )}
    </div>
  );
}

function TagChip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize" style={{ background: `${color}22`, color }}>
      {children}
    </span>
  );
}

export function MetaTrendsAds() {
  const [days] = useState(3);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [adSetFilter, setAdSetFilter] = useState<string>("");
  const [formatFilter, setFormatFilter] = useState<"video" | "image" | "carousel">("video");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/meta/trends/ads?days=${days}`)
      .then((r) => r.json())
      .then((d: ApiResp) => {
        if (cancel) return;
        setData(d);
        if (d.ads.length > 0) {
          const firstCampaign = d.ads[0].metaCampaignId;
          setCampaignFilter(firstCampaign);
          const firstAdSet = d.ads.find((a) => a.metaCampaignId === firstCampaign)?.metaAdSetId;
          if (firstAdSet) setAdSetFilter(firstAdSet);
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

  // Unique campaigns
  const campaigns = useMemo(() => {
    if (!data) return [] as { id: string; name: string }[];
    const map = new Map<string, string>();
    for (const a of data.ads) {
      if (!map.has(a.metaCampaignId)) map.set(a.metaCampaignId, a.campaignName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Ad sets in the chosen campaign
  const adSetsInCampaign = useMemo(() => {
    if (!data || !campaignFilter) return [] as { id: string; name: string }[];
    const map = new Map<string, string>();
    for (const a of data.ads) {
      if (a.metaCampaignId !== campaignFilter) continue;
      if (!map.has(a.metaAdSetId)) map.set(a.metaAdSetId, a.adSetName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, campaignFilter]);

  // When campaign changes, default ad-set to first in that campaign
  useEffect(() => {
    if (!campaignFilter || adSetsInCampaign.length === 0) return;
    const stillValid = adSetsInCampaign.some((s) => s.id === adSetFilter);
    if (!stillValid) setAdSetFilter(adSetsInCampaign[0].id);
  }, [campaignFilter, adSetsInCampaign, adSetFilter]);

  // Ads in the chosen ad set
  const adsInAdSet = useMemo(() => {
    if (!data || !adSetFilter) return [] as Ad[];
    return data.ads.filter((a) => a.metaAdSetId === adSetFilter);
  }, [data, adSetFilter]);

  // Counts per format (for tab badges) — only ads that actually spent so the
  // badge matches the list count.
  const formatCounts = useMemo(() => {
    const c = { video: 0, image: 0, carousel: 0 };
    for (const a of adsInAdSet) {
      if (a.current.spend > 0) c[normalizeFormat(a.creativeType)]++;
    }
    return c;
  }, [adsInAdSet]);

  // Filtered ads — by format, hiding zero-spend ads (paused / pending review
  // / not delivering). Sorted by spend desc so the top spenders are first.
  const filtered = useMemo(() => {
    return adsInAdSet
      .filter((a) => normalizeFormat(a.creativeType) === formatFilter && a.current.spend > 0)
      .sort((x, y) => y.current.spend - x.current.spend);
  }, [adsInAdSet, formatFilter]);

  const topSpend = filtered.length > 0 ? filtered[0].current.spend : 0;

  // Header context (selected campaign + adset names)
  const campaignName = campaigns.find((c) => c.id === campaignFilter)?.name ?? "—";
  const adSetName = adSetsInCampaign.find((s) => s.id === adSetFilter)?.name ?? "—";

  // Overall page-level alerts based on selected ad set (loosely)
  const alerts = useMemo(() => {
    const out: { tone: "red" | "amber" | "green"; text: string }[] = [];
    const bad = filtered.filter((a) => a.current.roas > 0 && a.current.roas < 1 && a.current.spend > 1000);
    if (bad.length > 0) {
      out.push({ tone: "red", text: `${bad.length} ad${bad.length === 1 ? "" : "s"} losing money in this set` });
    }
    const lowHook = filtered.filter((a) => formatFilter === "video" && a.current.hookRate > 0 && a.current.hookRate < 20);
    if (lowHook.length > 0) {
      out.push({ tone: "amber", text: `${lowHook.length} video${lowHook.length === 1 ? "" : "s"} with weak hook (<20%)` });
    }
    return out;
  }, [filtered, formatFilter]);

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
        <h1 className="text-xl font-bold" style={{ color: INK }}>Waterful — Meta Ads · Ads</h1>
        <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>
          Last {data.days} days · {data.window.from} – {data.window.to} · vs prior {data.days} days {data.priorWindow.from} – {data.priorWindow.to}
        </p>
      </div>

      {/* Alerts */}
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
            No critical creative issues
          </span>
        ) : (
          alerts.map((a, i) => {
            const c = a.tone === "red" ? ROSE : a.tone === "amber" ? AMBER : SAGE;
            return (
              <span key={i} className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={{ background: c, color: "white" }}>{a.text}</span>
            );
          })
        )}
      </div>

      {/* Dropdowns */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Campaign</label>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: "white" }}
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
            style={{ borderColor: BORDER, color: INK, background: "white" }}
          >
            {adSetsInCampaign.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm" style={{ color: INK }}>
        <FolderTree size={14} style={{ color: MUTED }} />
        <span className="font-medium">{campaignName}</span>
        <ChevronRight size={14} style={{ color: MUTED }} />
        <span className="font-medium">{adSetName}</span>
      </div>

      {/* Format tabs */}
      <div className="flex flex-wrap gap-2">
        {(["video", "image", "carousel"] as const).map((f) => {
          const active = f === formatFilter;
          const label = f === "image" ? "Static" : f === "video" ? "Video" : "Carousel";
          return (
            <button
              key={f}
              onClick={() => setFormatFilter(f)}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold border transition-colors"
              style={{
                background: active ? `${VIOLET}22` : "white",
                color: active ? VIOLET : MUTED,
                borderColor: active ? `${VIOLET}55` : BORDER,
              }}
            >
              {label} ({formatCounts[f]})
            </button>
          );
        })}
      </div>

      {/* Ad cards */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border p-12 text-center text-sm italic" style={{ background: "white", borderColor: BORDER, color: MUTED }}>
          No {formatFilter === "image" ? "static" : formatFilter} ads in this ad set with spend in this window.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((ad, i) => (
            <AdCard key={ad.metaAdId} ad={ad} rank={i + 1} topSpend={topSpend} />
          ))}
        </div>
      )}

      <MetricGuide />
    </div>
  );
}

function HealthPill({ roas }: { roas: number }) {
  const { label, color } =
    roas >= 1.8 ? { label: "Healthy", color: SAGE } :
    roas >= 1 ? { label: "Marginal", color: AMBER } :
    roas > 0 ? { label: "Losing money", color: ROSE } :
    { label: "No data", color: MUTED };
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: `${color}22`, color }}
    >
      {label} · ROAS {roas.toFixed(2)}x
    </span>
  );
}

function AdCard({ ad, rank, topSpend }: { ad: Ad; rank: number; topSpend: number }) {
  const fmt = ad.creativeType ? (ad.creativeType.toLowerCase().includes("video") ? "video" : ad.creativeType.toLowerCase().includes("carousel") ? "carousel" : "static") : "static";
  const isTopSpender = rank === 1 && ad.current.spend === topSpend && topSpend > 0;
  const isVideo = fmt === "video";

  return (
    <section className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: "white", borderColor: BORDER }}>
      <div className="px-5 py-4 border-b flex flex-wrap items-start justify-between gap-3" style={{ borderColor: BORDER }}>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold" style={{ color: INK }}>{ad.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <TagChip color={VIOLET}>{fmt}</TagChip>
            <span style={{ color: MUTED }}>
              Spend {formatInr(ad.current.spend)} · sorted #{rank} by spend
            </span>
          </div>
        </div>
        <HealthPill roas={ad.current.roas} />
      </div>

      <div className="p-4 space-y-4">
        {/* 9 mini metric cards in a 3-column grid — matches Campaigns / Ad
            Sets layout: descriptive caption + trend arrow with % next to value */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          {(() => {
            const spendTrend = intraWindowTrend(ad.series.spend, true);
            const purchasesTrend = intraWindowTrend(ad.series.purchases);
            const purchaseValueTrend = intraWindowTrend(ad.series.purchaseValue);
            const roasTrend = intraWindowTrend(ad.series.roas);
            const cpmTrend = intraWindowTrend(ad.series.cpm, true);
            const ctrTrend = intraWindowTrend(ad.series.ctr);
            const cpcTrend = intraWindowTrend(ad.series.cpc, true);
            const cppTrend = intraWindowTrend(ad.series.cpp, true);
            const freqTrend = intraWindowTrend(ad.series.frequency, true);
            const fmtCpp = (n: number) => {
              if (n <= 0) return "—";
              if (n < 1000) return `${Math.round(n)}`;
              return `${(n / 1000).toFixed(1)}K`;
            };
            // Spend reference line: parent ad-set's daily budget (ABO) first,
            // then campaign-level daily budget (CBO fallback). Pulled live from
            // Meta — no manual overrides.
            const plannedDaily =
              ad.adSetDailyBudget && ad.adSetDailyBudget > 0
                ? ad.adSetDailyBudget
                : ad.campaignDailyBudget && ad.campaignDailyBudget > 0
                ? ad.campaignDailyBudget
                : null;
            const budgetSource: "adset" | "campaign" | null =
              ad.adSetDailyBudget && ad.adSetDailyBudget > 0
                ? "adset"
                : plannedDaily
                ? "campaign"
                : null;
            const seriesDays = Math.max(1, ad.series.spend.length);
            const plannedWindow = plannedDaily ? plannedDaily * seriesDays : null;
            const budgetUtil =
              plannedWindow && plannedWindow > 0
                ? Math.round((ad.current.spend / plannedWindow) * 100)
                : null;
            const spendCaptionText = plannedDaily && budgetUtil != null
              ? `${budgetUtil}% of Rs.${Math.round(plannedDaily / 1000)}K/day${budgetSource === "campaign" ? " · CBO" : ""}`
              : isTopSpender
              ? "top spender"
              : `#${rank} by spend`;
            const spendCaptionColor = isTopSpender && !plannedDaily ? VIOLET : MUTED;
            return (
              <>
                <MiniMetric
                  label="Spend"
                  value={formatInr(ad.current.spend)}
                  caption={{ text: spendCaptionText, color: spendCaptionColor }}
                  quality={spendTrend?.quality ?? "neutral"}
                  series={ad.series.spend}
                  sparkFormatter={(n) => formatInr(n)}
                  trendArrow={spendTrend}
                  referenceLine={plannedDaily ? { value: plannedDaily, label: "budget" } : undefined}
                />
                <MiniMetric
                  label="Purchases"
                  value={`${ad.current.purchases}`}
                  caption={{ text: "No benchmark" }}
                  quality={
                    ad.current.purchases === 0
                      ? "neutral"
                      : purchasesTrend?.quality ?? "decent"
                  }
                  series={ad.series.purchases}
                  sparkFormatter={(n) => `${n}`}
                  trendArrow={purchasesTrend}
                />
                <MiniMetric
                  label="Purchase Value"
                  value={formatInr(ad.current.purchaseValue)}
                  caption={{ text: "No benchmark" }}
                  quality={
                    ad.current.purchaseValue === 0
                      ? "neutral"
                      : purchaseValueTrend?.quality ?? "decent"
                  }
                  series={ad.series.purchaseValue}
                  sparkFormatter={(n) => formatInr(n)}
                  trendArrow={purchaseValueTrend}
                />
                <MiniMetric
                  label="ROAS"
                  value={`${ad.current.roas.toFixed(2)}x`}
                  caption={{ text: "Target 1.8–2.5x" }}
                  quality={combineQuality(
                    qualityFromThreshold(ad.current.roas, { good: 1.8, decent: 1 }),
                    roasTrend?.quality ?? null,
                  )}
                  series={ad.series.roas}
                  sparkFormatter={(n) => `${n.toFixed(2)}`}
                  trendArrow={roasTrend}
                />
                <MiniMetric
                  label="CPM"
                  value={`Rs.${Math.round(ad.current.cpm)}`}
                  caption={{ text: "Target Rs.80–150" }}
                  quality={combineQuality(
                    qualityFromThreshold(ad.current.cpm, { good: 150, decent: 250 }, true),
                    cpmTrend?.quality ?? null,
                  )}
                  series={ad.series.cpm}
                  sparkFormatter={(n) => `Rs.${Math.round(n)}`}
                  trendArrow={cpmTrend}
                />
                <MiniMetric
                  label="CTR"
                  value={`${ad.current.ctr.toFixed(2)}%`}
                  caption={{ text: "Target 1.5–2%+" }}
                  quality={combineQuality(
                    qualityFromThreshold(ad.current.ctr, { good: 1.5, decent: 1 }),
                    ctrTrend?.quality ?? null,
                  )}
                  series={ad.series.ctr}
                  sparkFormatter={(n) => `${n.toFixed(1)}%`}
                  trendArrow={ctrTrend}
                />
                <MiniMetric
                  label="CPC"
                  value={`Rs.${Math.round(ad.current.cpc)}`}
                  caption={{ text: "Target Rs.10–30" }}
                  quality={combineQuality(
                    qualityFromThreshold(ad.current.cpc, { good: 30, decent: 60 }, true),
                    cpcTrend?.quality ?? null,
                  )}
                  series={ad.series.cpc}
                  sparkFormatter={(n) => `Rs.${Math.round(n)}`}
                  trendArrow={cpcTrend}
                />
                <MiniMetric
                  label="CPP"
                  value={ad.current.cpp > 0 ? `Rs.${Math.round(ad.current.cpp).toLocaleString("en-IN")}` : "—"}
                  caption={{ text: "Target Rs.600–1,500" }}
                  quality={combineQuality(
                    qualityFromThreshold(ad.current.cpp, { good: 1500, decent: 2500 }, true),
                    cppTrend?.quality ?? null,
                  )}
                  series={ad.series.cpp}
                  sparkFormatter={fmtCpp}
                  trendArrow={cppTrend}
                />
                <MiniMetric
                  label="Freq"
                  value={`${ad.current.frequency.toFixed(2)}x`}
                  caption={{ text: "Keep below 3x" }}
                  quality={combineQuality(
                    qualityFromThreshold(ad.current.frequency, { good: 2, decent: 3 }, true),
                    freqTrend?.quality ?? null,
                  )}
                  series={ad.series.frequency}
                  sparkFormatter={(n) => n.toFixed(2)}
                  trendArrow={freqTrend}
                />
              </>
            );
          })()}
        </div>

        {/* Video completion strip — only for video format */}
        {isVideo && (() => {
          const imp = ad.current.impressions;
          const hookPct = imp > 0 ? (ad.current.video3sViews / imp) * 100 : 0;
          const q25Pct = imp > 0 ? (ad.current.video25pViews / imp) * 100 : 0;
          const q50Pct = imp > 0 ? (ad.current.video50pViews / imp) * 100 : 0;
          const q75Pct = imp > 0 ? (ad.current.videoP75Views / imp) * 100 : 0;
          return (
            <div
              className="rounded-xl border px-4 py-3"
              style={{ background: `${VIOLET}10`, borderColor: `${VIOLET}55` }}
            >
              <p className="text-[11px] font-semibold" style={{ color: VIOLET }}>Video completion</p>
              <p className="text-[10px] mt-0.5 mb-3" style={{ color: MUTED }}>
                How far viewers actually watched. Each % is share of impressions — a descending funnel as viewers drop off at each stage.
              </p>
              <div className="grid grid-cols-4 gap-3">
                <CompletionCell
                  label="Hook rate (3s)"
                  value={imp > 0 ? `${hookPct.toFixed(1)}%` : "—"}
                  numericValue={hookPct}
                  meaning="watched past first 3 seconds"
                  benchmark={{ good: 30, decent: 20 }}
                />
                <CompletionCell
                  label="25% watched"
                  value={imp > 0 ? `${q25Pct.toFixed(1)}%` : "—"}
                  numericValue={q25Pct}
                  meaning="made it through the first quarter"
                  benchmark={{ good: 15, decent: 8 }}
                />
                <CompletionCell
                  label="50% watched"
                  value={imp > 0 ? `${q50Pct.toFixed(1)}%` : "—"}
                  numericValue={q50Pct}
                  meaning="reached the midpoint"
                  benchmark={{ good: 10, decent: 5 }}
                />
                <CompletionCell
                  label="75% watched"
                  value={imp > 0 ? `${q75Pct.toFixed(1)}%` : "—"}
                  numericValue={q75Pct}
                  meaning="watched most of the video"
                  benchmark={{ good: 6, decent: 3 }}
                />
              </div>
            </div>
          );
        })()}

        {/* Conversion funnel */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
            Conversion funnel
          </p>
          <FunnelRow ad={ad} />
        </div>
      </div>
    </section>
  );
}

function CompletionCell({
  label,
  value,
  numericValue,
  meaning,
  benchmark,
}: {
  label: string;
  value: string;
  numericValue: number;
  meaning: string;
  benchmark: { good: number; decent: number };
}) {
  const tone =
    numericValue >= benchmark.good ? "good" :
    numericValue >= benchmark.decent ? "decent" :
    numericValue > 0 ? "bad" : "neutral";
  const valueColor = tone === "good" ? SAGE : tone === "decent" ? AMBER : tone === "bad" ? ROSE : MUTED;
  const toneLabel = tone === "good" ? "Good" : tone === "decent" ? "OK" : tone === "bad" ? "Weak" : "—";
  return (
    <div className="text-center">
      <p className="text-[10px]" style={{ color: MUTED }}>{label}</p>
      <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: valueColor }}>{value}</p>
      <p className="text-[9px] mt-0.5" style={{ color: MUTED }}>{meaning}</p>
      <span
        className="inline-block mt-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none"
        style={{ background: `${valueColor}22`, color: valueColor }}
      >
        {toneLabel} · &gt;{benchmark.good}%
      </span>
    </div>
  );
}

function FunnelRow({ ad }: { ad: Ad }) {
  // Each stage carries its own drop benchmark for the transition INTO it from
  // the previous stage. Numbers are typical D2C / e-commerce ranges:
  //   • Click → LP view: 10–25% drop is normal (page load + early abandonment)
  //   • LP → Add to cart: 85–95% drop is normal (most LP visitors are browsing)
  //   • ATC → Checkout: 30–50% drop is normal (cart abandonment)
  //   • Checkout → Purchase: 30–50% drop (payment / shipping friction)
  const stages: {
    label: string;
    count: number;
    benchmark?: { good: number; alarm: number; reference: string };
  }[] = [
    { label: "Clicks", count: ad.current.clicks },
    {
      label: "Landing page",
      count: ad.current.landingPageViews,
      benchmark: { good: 25, alarm: 40, reference: "industry: 10–25%" },
    },
    {
      label: "Add to cart",
      count: ad.current.addToCart,
      benchmark: { good: 95, alarm: 97, reference: "industry: 85–95%" },
    },
    {
      label: "Checkout",
      count: ad.current.initiateCheckout,
      benchmark: { good: 50, alarm: 65, reference: "industry: 30–50%" },
    },
    {
      label: "Purchase",
      count: ad.current.purchases,
      benchmark: { good: 50, alarm: 65, reference: "industry: 30–50%" },
    },
  ];
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].count : null;
        const passPct = prev != null && prev > 0 ? Math.round((s.count / prev) * 100) : null;
        const dropPct = passPct != null ? 100 - passPct : null;
        // Use the stage's own benchmark to color the drop: under "good"
        // threshold = sage, over "alarm" = rose, in between = amber.
        const bench = s.benchmark;
        let dropColor = MUTED;
        if (dropPct != null && bench) {
          dropColor = dropPct <= bench.good ? SAGE : dropPct >= bench.alarm ? ROSE : AMBER;
        }
        return (
          <div key={s.label} className="flex items-stretch flex-1 min-w-0 gap-2">
            {i > 0 && (
              <div className="flex flex-col items-center justify-center shrink-0 min-w-[64px]">
                <span className="text-[11px] font-bold tabular-nums" style={{ color: dropColor }}>
                  {dropPct == null ? "—" : `-${dropPct}%`}
                </span>
                <ChevronRight size={14} style={{ color: MUTED }} />
                {bench && (
                  <span className="text-[8.5px] mt-0.5 leading-tight text-center" style={{ color: MUTED }}>
                    {bench.reference}
                  </span>
                )}
              </div>
            )}
            <div
              className="rounded-xl border px-3 py-2.5 flex-1 min-w-[80px]"
              style={{ borderColor: BORDER, background: i === stages.length - 1 ? `${SAGE}10` : CREAM_BG }}
            >
              <p className="text-lg font-bold tabular-nums" style={{ color: INK }}>
                {s.count.toLocaleString("en-IN")}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>{s.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricGuide() {
  const guides = [
    { title: "CPM — Cost per 1,000 impressions", target: "Target: Rs.80–Rs.150", body: "How efficiently Meta is distributing the ad. High CPM means competitive auction or low relevance." },
    { title: "CTR — Click-through rate", target: "Target: 1.5–2%+", body: "Percentage who clicked after seeing the ad. Primary signal of how compelling the creative is." },
    { title: "CPC — Cost per click", target: "Target: Rs.10–Rs.30", body: "Combined signal of CPM and CTR. High CPC usually means bad audience match or weak creative." },
    { title: "ROAS — Return on ad spend", target: "Target: 1.8–2.5x", body: "Revenue earned per Rs.1 spent. The final verdict on whether an ad is profitable." },
    { title: "Hook rate (video only)", target: "Target: 25–30%+", body: "Percentage who watched the first 3 seconds. If low, the opening frame is not grabbing attention." },
    { title: "Conversion funnel", target: "Drop-off % at each step", body: "Shows where people leave between click and purchase. High drop at landing page = page issue. High drop at cart = pricing or friction." },
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
