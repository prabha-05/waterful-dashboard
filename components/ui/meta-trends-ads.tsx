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
function formatNum(v: number) {
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return `${v.toLocaleString("en-IN")}`;
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

// Tiny sparkline used inside each mini-metric card. Bars + value-above +
// date-below, scaled to fit the narrow card column.
function MiniSpark({ points, color, formatter }: { points: DailyPoint[]; color: string; formatter: (n: number) => string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="flex items-end gap-1.5 mt-2">
      {points.map((p) => {
        const h = max > 0 ? Math.max(6, (p.value / max) * 28) : 6;
        return (
          <div key={p.date} className="flex flex-col items-center flex-1 min-w-0">
            <span className="text-[9px] font-semibold tabular-nums leading-none mb-0.5" style={{ color: INK }}>
              {formatter(p.value)}
            </span>
            <div className="w-full rounded-sm" style={{ height: `${h}px`, background: color }} title={`${p.label}: ${p.value}`} />
            <span className="text-[8px] mt-0.5" style={{ color: MUTED }}>{p.label}</span>
          </div>
        );
      })}
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
}: {
  label: string;
  value: string;
  caption: { text: string; color?: string } | null;
  quality: Quality;
  // Optional 3-bar sparkline series for daily breakdown. Omit to render a
  // compact card with no chart (used for cards where daily isn't meaningful).
  series?: DailyPoint[];
  sparkFormatter?: (n: number) => string;
}) {
  const color = qualityColor(quality);
  const bg =
    quality === "good" ? `${SAGE}15` :
    quality === "decent" ? `${AMBER}18` :
    quality === "bad" ? `${ROSE}18` :
    CREAM_BG;
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{ background: bg, borderColor: quality === "neutral" ? BORDER : `${color}55` }}
    >
      <p className="text-[10px] font-semibold" style={{ color: MUTED }}>{label}</p>
      <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: quality === "bad" ? ROSE : INK }}>
        {value}
      </p>
      {caption && (
        <p className="text-[10px] font-semibold mt-0.5" style={{ color: caption.color ?? MUTED }}>
          {caption.text}
        </p>
      )}
      {series && sparkFormatter && <MiniSpark points={series} color={color} formatter={sparkFormatter} />}
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

  // Counts per format (for tab badges)
  const formatCounts = useMemo(() => {
    const c = { video: 0, image: 0, carousel: 0 };
    for (const a of adsInAdSet) c[normalizeFormat(a.creativeType)]++;
    return c;
  }, [adsInAdSet]);

  // Filtered ads (by format) + sorted by spend desc
  const filtered = useMemo(() => {
    return adsInAdSet.filter((a) => normalizeFormat(a.creativeType) === formatFilter)
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
        {/* 8 mini metric cards in a 4×2 grid */}
        {/* Order: Spend → Purchases → Purchase Value → ROAS → rest */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          <MiniMetric
            label="Spend"
            value={formatInr(ad.current.spend)}
            caption={{
              text: isTopSpender ? "top spender" : `#${rank} by spend`,
              color: isTopSpender ? VIOLET : MUTED,
            }}
            quality="neutral"
            series={ad.series.spend}
            sparkFormatter={(n) => formatInr(n)}
          />
          <MiniMetric
            label="Purchases"
            value={`${ad.current.purchases}`}
            caption={numericDelta(ad.current.purchases, ad.previous?.purchases)}
            quality={
              ad.current.purchases === 0 ? "neutral" :
              ad.previous && ad.previous.purchases > 0 && ad.current.purchases >= ad.previous.purchases ? "good" :
              "decent"
            }
            series={ad.series.purchases}
            sparkFormatter={(n) => `${n}`}
          />
          <MiniMetric
            label="Purchase Value"
            value={formatInr(ad.current.purchaseValue)}
            caption={numericDelta(ad.current.purchaseValue, ad.previous?.purchaseValue)}
            quality={
              ad.current.purchaseValue === 0 ? "neutral" :
              ad.previous && ad.previous.purchaseValue > 0 && ad.current.purchaseValue >= ad.previous.purchaseValue ? "good" :
              "decent"
            }
            series={ad.series.purchaseValue}
            sparkFormatter={(n) => formatInr(n)}
          />
          <MiniMetric
            label="ROAS"
            value={`${ad.current.roas.toFixed(2)}x`}
            caption={numericDelta(ad.current.roas, ad.previous?.roas)}
            quality={qualityFromThreshold(ad.current.roas, { good: 1.8, decent: 1 })}
            series={ad.series.roas}
            sparkFormatter={(n) => `${n.toFixed(2)}`}
          />
          <MiniMetric
            label="CPM"
            value={`Rs.${Math.round(ad.current.cpm)}`}
            caption={{
              text: ad.current.cpm <= 150 ? "in range" : ad.current.cpm <= 250 ? "above target" : "high",
              color: ad.current.cpm <= 150 ? SAGE : ad.current.cpm <= 250 ? AMBER : ROSE,
            }}
            quality={qualityFromThreshold(ad.current.cpm, { good: 150, decent: 250 }, true)}
            series={ad.series.cpm}
            sparkFormatter={(n) => `Rs.${Math.round(n)}`}
          />
          <MiniMetric
            label="CTR"
            value={`${ad.current.ctr.toFixed(2)}%`}
            caption={numericDelta(ad.current.ctr, ad.previous?.ctr)}
            quality={qualityFromThreshold(ad.current.ctr, { good: 1.5, decent: 1 })}
            series={ad.series.ctr}
            sparkFormatter={(n) => `${n.toFixed(1)}%`}
          />
          <MiniMetric
            label="CPC"
            value={`Rs.${Math.round(ad.current.cpc)}`}
            caption={{
              text: ad.current.cpc <= 30 ? "in range" : ad.current.cpc <= 60 ? "above target" : "high",
              color: ad.current.cpc <= 30 ? SAGE : ad.current.cpc <= 60 ? AMBER : ROSE,
            }}
            quality={qualityFromThreshold(ad.current.cpc, { good: 30, decent: 60 }, true)}
            series={ad.series.cpc}
            sparkFormatter={(n) => `Rs.${Math.round(n)}`}
          />
          <MiniMetric
            label="CPP"
            value={ad.current.cpp > 0 ? `Rs.${Math.round(ad.current.cpp).toLocaleString("en-IN")}` : "—"}
            caption={numericDelta(ad.current.cpp, ad.previous?.cpp, true)}
            quality={qualityFromThreshold(ad.current.cpp, { good: 1500, decent: 2500 }, true)}
            series={ad.series.cpp}
            sparkFormatter={(n) => (n > 0 ? `${Math.round(n / 1000)}K` : "—")}
          />
          <MiniMetric
            label="Freq"
            value={`${ad.current.frequency.toFixed(2)}x`}
            caption={(() => {
              const d = pctDelta(ad.current.frequency, ad.previous?.frequency);
              if (d === null) return { text: "—", color: MUTED };
              if (Math.abs(d) < 0.05) return { text: "stable", color: MUTED };
              const rising = d > 0;
              const color = rising ? ROSE : SAGE;
              return { text: rising ? "↑ rising" : "↓ falling", color };
            })()}
            quality={qualityFromThreshold(ad.current.frequency, { good: 2, decent: 3 }, true)}
            series={ad.series.frequency}
            sparkFormatter={(n) => n.toFixed(2)}
          />
        </div>

        {/* Video completion strip — only for video format */}
        {isVideo && (
          <div
            className="rounded-xl border px-4 py-3"
            style={{ background: `${VIOLET}10`, borderColor: `${VIOLET}55` }}
          >
            <p className="text-[11px] font-semibold mb-2" style={{ color: VIOLET }}>Video completion</p>
            {/* All four % are share-of-impressions so they form a clean
                descending funnel. Using "of 3s viewers" breaks for short
                videos where 25% completes before 3 seconds. */}
            <div className="grid grid-cols-4 gap-3">
              <CompletionCell
                label="Hook rate (3s)"
                value={ad.current.impressions > 0 ? `${((ad.current.video3sViews / ad.current.impressions) * 100).toFixed(1)}%` : "—"}
                sub="of impressions"
              />
              <CompletionCell
                label="25% watched"
                value={ad.current.impressions > 0 ? `${((ad.current.video25pViews / ad.current.impressions) * 100).toFixed(1)}%` : "—"}
                sub="of impressions"
              />
              <CompletionCell
                label="50% watched"
                value={ad.current.impressions > 0 ? `${((ad.current.video50pViews / ad.current.impressions) * 100).toFixed(1)}%` : "—"}
                sub="of impressions"
              />
              <CompletionCell
                label="ThruPlay"
                value={ad.current.impressions > 0 ? `${((ad.current.videoP75Views / ad.current.impressions) * 100).toFixed(1)}%` : "—"}
                sub="75% of impressions"
              />
            </div>
          </div>
        )}

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

function CompletionCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px]" style={{ color: MUTED }}>{label}</p>
      <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: VIOLET }}>{value}</p>
      {sub && <p className="text-[9px] mt-0.5 italic" style={{ color: MUTED }}>{sub}</p>}
    </div>
  );
}

function FunnelRow({ ad }: { ad: Ad }) {
  const stages = [
    { label: "Clicks", count: ad.current.clicks },
    { label: "Landing page", count: ad.current.landingPageViews },
    { label: "Add to cart", count: ad.current.addToCart },
    { label: "Checkout", count: ad.current.initiateCheckout },
    { label: "Purchase", count: ad.current.purchases },
  ];
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].count : null;
        const passPct = prev != null && prev > 0 ? Math.round((s.count / prev) * 100) : null;
        const dropPct = passPct != null ? 100 - passPct : null;
        const dropColor = dropPct == null ? MUTED : dropPct >= 80 ? ROSE : dropPct >= 50 ? AMBER : SAGE;
        return (
          <div key={s.label} className="flex items-stretch flex-1 min-w-0 gap-2">
            {i > 0 && (
              <div className="flex flex-col items-center justify-center shrink-0 min-w-[44px]">
                <span className="text-[10px] font-semibold tabular-nums" style={{ color: dropColor }}>
                  {dropPct == null ? "—" : `-${dropPct}%`}
                </span>
                <ChevronRight size={14} style={{ color: MUTED }} />
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
