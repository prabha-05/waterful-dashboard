"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import {
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Sparkles,
  TrendingUp,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const VIOLET = "#8b5cf6";
const TEAL = "#0d9488";
const CREAM = "#f1e7d3";
const CREAM_BG = "#faf6ef";
const BORDER = "#e8dfd0";

type DailyPoint = {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  landingPageViews: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  purchaseValue: number;
  frequency: number;
  hookRate: number;
  holdRate: number;
};

type Ad = {
  adId: number;
  metaAdId: string;
  name: string;
  status: string;
  adSetName: string;
  campaignName: string;
  creativeType: string | null;
  thumbnailUrl: string | null;
  previewLink: string | null;
  qualityRanking: string | null;
  engagementRateRanking: string | null;
  conversionRateRanking: string | null;
  daysRunning: number;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  landingPageViews: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  purchaseValue: number;
  avgFrequency: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  daily: DailyPoint[];
};

type ApiResponse = {
  window: { from: string; to: string };
  totals: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    purchases: number;
    purchaseValue: number;
    ctr: number;
    cpa: number;
    roas: number;
    avgFrequency: number;
    adsCount: number;
  };
  totalDailySpend: { date: string; spend: number }[];
  ads: Ad[];
  meta: {
    lastSyncedAt: string | null;
    totalAds: number;
    activeAds: number;
  };
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function formatInr(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function formatRelative(iso: string | null) {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function deltaPct(series: number[]): number {
  if (series.length < 2) return 0;
  const half = Math.ceil(series.length / 2);
  const first = series.slice(0, half).reduce((a, b) => a + b, 0);
  const last = series.slice(half).reduce((a, b) => a + b, 0);
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

function todayIstYmd(): string {
  const now = new Date();
  // IST = UTC+5:30
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rankingLabel(rank: string | null): { label: string; color: string } | null {
  if (!rank || rank === "UNKNOWN") return null;
  const isAbove = rank.includes("ABOVE");
  const isBelow = rank.includes("BELOW");
  if (isAbove) return { label: "Above avg", color: SAGE };
  if (isBelow) return { label: "Below avg", color: ROSE };
  return { label: "Average", color: MUTED };
}

function thumbInitial(name: string): string {
  const trimmed = name.trim();
  return (trimmed[0] || "?").toUpperCase();
}

function thumbColor(name: string): string {
  const palette = [ROSE, AMBER, VIOLET, TEAL, SAGE, "#cc7a3f"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

// ─────────────────────────────────────────────────────────────────
// Mini Sparkline (table rows)
// ─────────────────────────────────────────────────────────────────
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const points = data.map((v, i) => ({ i, v }));
  const gradId = `spark-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width={80} height={24}>
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────────
// Chart Card (drill-down grid)
// ─────────────────────────────────────────────────────────────────
type ChartType = "area" | "bar" | "line";
// Verdict card. Big number + caption with quality-colored accent stripe + dot.
function VerdictCard({
  title,
  subtitle,
  value,
  formatted,
  unit,
  target,
  caption,
  lowerIsBetter = false,
  noData = false,
}: {
  title: string;
  // One-line plain-English explanation of the metric, shown under the title.
  subtitle?: string;
  value: number;
  formatted: string;
  unit?: string;
  target: { from: number; to: number };
  caption: string;
  lowerIsBetter?: boolean;
  noData?: boolean;
}) {
  // Quality color:
  //   higher-better: value >= target.from = Good; >= target.from*0.7 = Decent; else Poor
  //   lower-better:  value <= target.from = Good; <= target.to = Decent; else Poor
  const quality = noData
    ? { color: MUTED, label: "no data" }
    : lowerIsBetter
    ? value <= target.from
      ? { color: SAGE, label: "Good" }
      : value <= target.to
      ? { color: AMBER, label: "Decent" }
      : { color: ROSE, label: "Poor" }
    : value >= target.from
    ? { color: SAGE, label: "Good" }
    : value >= target.from * 0.7
    ? { color: AMBER, label: "Decent" }
    : { color: ROSE, label: "Poor" };

  return (
    <div
      className="rounded-2xl border p-4 shadow-sm relative overflow-hidden"
      style={{
        background: noData ? "white" : `${quality.color}33`,
        borderColor: noData ? BORDER : `${quality.color}88`,
      }}
    >
      {/* top accent stripe — colored by quality */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: quality.color }}
      />
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: quality.color }}
          />
          <p className="text-[12px] font-semibold" style={{ color: INK }}>
            {title}
          </p>
        </div>
        {subtitle && (
          <p className="text-[10px] mt-0.5 leading-snug" style={{ color: MUTED }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        {noData ? (
          <span className="text-xl" style={{ color: MUTED }}>—  no data</span>
        ) : (
          <>
            <span className="text-3xl font-bold tabular-nums" style={{ color: INK }}>
              {formatted}
            </span>
            {unit && (
              <span className="text-sm" style={{ color: MUTED }}>
                {unit}
              </span>
            )}
          </>
        )}
      </div>
      <p className="text-xs mb-3" style={{ color: MUTED }}>
        {caption}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  data,
  formatY,
  formatTip,
  chartType = "area",
  color,
  threshold,
  thresholdLabel,
  warnZone,
  benchmark,
}: {
  title: string;
  data: { date: string; value: number }[];
  formatY?: (v: number) => string;
  formatTip?: (v: number) => string;
  chartType?: ChartType;
  color: string;
  threshold?: number;
  thresholdLabel?: string;
  warnZone?: { from: number; color: string };
  // Industry-benchmark pill. `lowerIsBetter` flips comparison (CPA, Frequency).
  // `unit` is appended in the std caption — e.g. "%", "x", "₹".
  benchmark?: { good: number; decent: number; unit?: string; lowerIsBetter?: boolean };
}) {
  const series = data.map((d) => d.value);
  const delta = deltaPct(series);
  const arrowColor = delta > 0 ? SAGE : delta < 0 ? ROSE : MUTED;
  const ArrowIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : null;

  // Average of the series, used to evaluate the benchmark.
  const seriesAvg = series.length > 0 ? series.reduce((s, v) => s + v, 0) / series.length : 0;
  const quality = benchmark
    ? benchmark.lowerIsBetter
      ? seriesAvg <= benchmark.good
        ? { label: "Good", color: SAGE }
        : seriesAvg <= benchmark.decent
        ? { label: "Decent", color: AMBER }
        : { label: "Poor", color: ROSE }
      : seriesAvg >= benchmark.good
      ? { label: "Good", color: SAGE }
      : seriesAvg >= benchmark.decent
      ? { label: "Decent", color: AMBER }
      : { label: "Poor", color: ROSE }
    : null;
  const benchmarkUnit = benchmark?.unit ?? "";
  const benchmarkCaption = benchmark
    ? benchmark.lowerIsBetter
      ? `std: ≤${benchmark.good}${benchmarkUnit} good · ≤${benchmark.decent}${benchmarkUnit} ok`
      : `std: ≥${benchmark.good}${benchmarkUnit} good · ≥${benchmark.decent}${benchmarkUnit} ok`
    : null;

  const fmtY = formatY ?? ((v: number) => `${v}`);
  const fmtTip = formatTip ?? fmtY;
  const gradientId = `g-${title.replace(/\W/g, "")}`;

  const chartData = data.map((d) => ({
    label: d.date.slice(5),
    value: d.value,
  }));

  return (
    <div
      className="rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md"
      style={{ background: "white", borderColor: BORDER }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          {title}
        </p>
        {Math.abs(delta) > 0.5 && (
          <span
            className="flex items-center gap-0.5 text-[10px] font-semibold tabular-nums"
            style={{ color: arrowColor }}
          >
            {ArrowIcon && <ArrowIcon size={10} />}
            {delta > 0 ? "+" : ""}
            {delta.toFixed(0)}%
          </span>
        )}
      </div>
      {quality && benchmarkCaption && (
        <div className="mb-2 flex items-center gap-1.5 flex-wrap">
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none"
            style={{ background: `${quality.color}22`, color: quality.color }}
          >
            {quality.label}
          </span>
          <span className="text-[9px]" style={{ color: MUTED }}>
            {benchmarkCaption}
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={90}>
        {chartType === "bar" ? (
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={CREAM} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} width={32} tickFormatter={fmtY} />
            <Tooltip
              formatter={(v: any) => [fmtTip(Number(v)), title]}
              contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${CREAM}` }}
              labelStyle={{ color: INK }}
            />
            {threshold !== undefined && (
              <ReferenceLine y={threshold} stroke={MUTED} strokeDasharray="2 2" strokeWidth={1} label={{ value: thresholdLabel, fontSize: 9, fill: MUTED, position: "right" }} />
            )}
            <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
          </BarChart>
        ) : chartType === "line" ? (
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={CREAM} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} width={32} tickFormatter={fmtY} />
            <Tooltip
              formatter={(v: any) => [fmtTip(Number(v)), title]}
              contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${CREAM}` }}
              labelStyle={{ color: INK }}
            />
            {warnZone && (
              <ReferenceLine y={warnZone.from} stroke={warnZone.color} strokeDasharray="2 2" strokeWidth={1} label={{ value: thresholdLabel, fontSize: 9, fill: warnZone.color, position: "right" }} />
            )}
            {threshold !== undefined && (
              <ReferenceLine y={threshold} stroke={MUTED} strokeDasharray="2 2" strokeWidth={1} label={{ value: thresholdLabel, fontSize: 9, fill: MUTED, position: "right" }} />
            )}
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 2, fill: color }} activeDot={{ r: 4 }} />
          </LineChart>
        ) : (
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke={CREAM} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} width={32} tickFormatter={fmtY} />
            <Tooltip
              formatter={(v: any) => [fmtTip(Number(v)), title]}
              contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${CREAM}` }}
              labelStyle={{ color: INK }}
            />
            {threshold !== undefined && (
              <ReferenceLine y={threshold} stroke={MUTED} strokeDasharray="2 2" strokeWidth={1} label={{ value: thresholdLabel, fontSize: 9, fill: MUTED, position: "right" }} />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={{ r: 2, fill: color }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────
export function MetaAds() {
  // Default: last 7 days ending yesterday (IST)
  const yesterday = shiftYmd(todayIstYmd(), -1);
  const sevenAgo = shiftYmd(yesterday, -6);

  const [from, setFrom] = useState(sevenAgo);
  const [to, setTo] = useState(yesterday);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Format filter: ALL | video | image | carousel
  const [formatFilter, setFormatFilter] = useState<"ALL" | "video" | "image" | "carousel">("ALL");
  // Status filter: ALL | ACTIVE | PAUSED
  // Minimum spend filter (in INR). 0 = no filter.
  const [minSpend, setMinSpend] = useState<number>(0);
  // Hierarchy expansion state
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());
  const toggleCampaign = (name: string) =>
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  const toggleAdSet = (key: string) =>
    setExpandedAdSets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const drillRef = useRef<HTMLElement | null>(null);

  const selectAndScroll = (adId: number) => {
    setSelectedId(adId);
    // Defer to next frame so the drill section is mounted before we scroll
    requestAnimationFrame(() => {
      drillRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  // Sort key: by spend, hook rate, ROAS, CTR, frequency
  type SortKey = "spend" | "hookRate" | "roas" | "ctr" | "frequency";
  const [sortBy, setSortBy] = useState<SortKey>("spend");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/meta/ads?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        if (cancelled) return;
        setData(d);
        if (d.ads && d.ads.length > 0) {
          // Deep-link: if the URL has ?metaAdId=…, jump to that ad and scroll
          // into the drill-down. Used by the Campaigns page "Ads by attributed
          // orders" rollup to drill in on a specific creative.
          const url = new URL(window.location.href);
          const deepMetaAdId = url.searchParams.get("metaAdId");
          if (deepMetaAdId) {
            const match = d.ads.find((a) => a.metaAdId === deepMetaAdId);
            if (match) {
              setSelectedId(match.adId);
              requestAnimationFrame(() => {
                drillRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
              return;
            }
          }
          setSelectedId((cur) => (cur && d.ads.some((a) => a.adId === cur) ? cur : d.ads[0].adId));
        } else {
          setSelectedId(null);
        }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  // Weighted-average helpers (across daily series for a single ad)
  const weightedAvg = (ad: Ad, key: "hookRate" | "holdRate") => {
    let num = 0;
    let denom = 0;
    for (const d of ad.daily) {
      num += d[key] * d.impressions;
      denom += d.impressions;
    }
    return denom > 0 ? num / denom : 0;
  };

  // Normalize Meta's creativeType (which can be "share", "dco", "post", etc.)
  // into the 3 buckets we display: video / carousel / image.
  const normalizeFormat = (t: string | null): "video" | "carousel" | "image" => {
    const raw = (t ?? "").toLowerCase();
    if (raw === "video") return "video";
    if (raw === "carousel") return "carousel";
    return "image"; // everything else (share, dco, post, null, etc.)
  };

  // Filter by format + sort
  const filteredAds = useMemo(() => {
    if (!data) return [];
    const filtered = data.ads.filter((a) => {
      if (formatFilter !== "ALL" && normalizeFormat(a.creativeType) !== formatFilter) return false;
      if (minSpend > 0 && a.spend < minSpend) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "hookRate":
          return weightedAvg(b, "hookRate") - weightedAvg(a, "hookRate");
        case "roas":
          return b.roas - a.roas;
        case "ctr":
          return b.ctr - a.ctr;
        case "frequency":
          return b.avgFrequency - a.avgFrequency;
        default:
          return b.spend - a.spend;
      }
    });
    return sorted;
  }, [data, formatFilter, minSpend, sortBy]);

  // Build Campaign → Ad Set → Ad hierarchy from the filtered ads.
  type AdType = (typeof filteredAds)[number];
  const hierarchy = useMemo(() => {
    const campaigns = new Map<
      string,
      {
        name: string;
        status: string;
        spend: number;
        adSets: Map<string, { name: string; status: string; spend: number; ads: AdType[] }>;
      }
    >();
    for (const ad of filteredAds) {
      const cName = ad.campaignName || "(Unknown campaign)";
      const asName = ad.adSetName || "(Unknown ad set)";
      let camp = campaigns.get(cName);
      if (!camp) {
        camp = { name: cName, status: ad.status, spend: 0, adSets: new Map() };
        campaigns.set(cName, camp);
      }
      camp.spend += ad.spend;
      let as = camp.adSets.get(asName);
      if (!as) {
        as = { name: asName, status: ad.status, spend: 0, ads: [] };
        camp.adSets.set(asName, as);
      }
      as.spend += ad.spend;
      as.ads.push(ad);
    }
    // Sort: campaigns by total spend, ad sets by spend, ads by spend (already sorted in filteredAds — keep order)
    return Array.from(campaigns.values())
      .map((c) => ({
        ...c,
        adSets: Array.from(c.adSets.values()).sort((a, b) => b.spend - a.spend),
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [filteredAds]);

  // If the currently-selected ad gets filtered out, fall back to the top of
  // the filtered list (or clear selection if the list is empty).
  useEffect(() => {
    if (filteredAds.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!filteredAds.some((a) => a.adId === selectedId)) {
      setSelectedId(filteredAds[0].adId);
    }
  }, [filteredAds, selectedId]);

  const selected = useMemo(() => {
    if (!data || selectedId == null) return null;
    return data.ads.find((a) => a.adId === selectedId) ?? null;
  }, [data, selectedId]);

  const filterBar = (
    <div
      className="flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm"
      style={{ background: "white", borderColor: BORDER }}
    >
      <div className="flex items-center gap-2">
        <Calendar size={14} style={{ color: AMBER }} />
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>From</label>
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>To</label>
        <input
          type="date"
          value={to}
          min={from}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
        />
      </div>

      <span className="ml-auto text-xs" style={{ color: MUTED }}>
        {data ? (
          <>
            <span className="font-bold" style={{ color: INK }}>{filteredAds.length}</span>
            {formatFilter !== "ALL" && (
              <>
                {" of "}
                <span className="font-semibold" style={{ color: INK }}>{data.totals.adsCount}</span>
              </>
            )}
            {" ads"}
            {" · "}
            Last sync: <span className="font-semibold" style={{ color: INK }}>{formatRelative(data.meta.lastSyncedAt)}</span>
          </>
        ) : "—"}
      </span>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="space-y-6">
        {filterBar}
        <div className="text-center py-16 text-sm italic" style={{ color: MUTED }}>
          Loading ads…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {filterBar}
        <div className="text-center py-16 text-sm" style={{ color: ROSE }}>
          Couldn&apos;t load ad data.
        </div>
      </div>
    );
  }

  const totalSpend = data.totals.spend;

  return (
    <div className={`space-y-6 ${loading ? "opacity-70 transition-opacity" : ""}`}>
      {filterBar}

      {/* Ads table */}
      <section className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: "white", borderColor: BORDER }}>
        <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: BORDER }}>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold" style={{ color: INK }}>Ads with spend</h2>
            <p className="text-xs italic mt-1" style={{ color: MUTED }}>
              Click any row to drill in below.
            </p>
          </div>
          <div
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
            style={{
              borderColor: minSpend > 0 ? SAGE : BORDER,
              background: minSpend > 0 ? `${SAGE}15` : CREAM_BG,
            }}
          >
            <label className="text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: MUTED }}>
              Spend &gt;
            </label>
            <span style={{ color: MUTED }}>₹</span>
            <input
              type="number"
              min={0}
              step={100}
              value={minSpend || ""}
              onChange={(e) => setMinSpend(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0"
              className="w-24 bg-transparent outline-none text-sm font-semibold tabular-nums"
              style={{ color: INK }}
            />
          </div>
          <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: BORDER }}>
            {(["ALL", "video", "image", "carousel"] as const).map((f) => {
              const active = formatFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFormatFilter(f)}
                  className="px-3 py-1.5 text-xs font-medium capitalize transition-colors"
                  style={{
                    background: active ? INK : "white",
                    color: active ? "white" : INK,
                  }}
                >
                  {f === "ALL" ? "All" : f}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
            >
              <option value="spend">Spend</option>
              <option value="hookRate">Hook rate</option>
              <option value="roas">ROAS</option>
              <option value="ctr">CTR</option>
              <option value="frequency">Frequency</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: CREAM_BG }}>
                {[
                  { label: "Campaign / Ad Set / Ad", align: "left" },
                  { label: "Format", align: "left" },
                  { label: "Spend", align: "right" },
                  { label: "Hook rate", align: "right" },
                  { label: "ThruPlay", align: "right" },
                  { label: "CTR", align: "right" },
                  { label: "CPA", align: "right" },
                  { label: "ROAS", align: "right" },
                  { label: "Fatigue", align: "left" },
                  { label: "Status", align: "left" },
                ].map((h) => (
                  <th
                    key={h.label}
                    className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: MUTED, textAlign: h.align as "left" | "right" }}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAds.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-sm italic" style={{ color: MUTED }}>
                    {data.ads.length === 0
                      ? "No ad spend in this window. Try a wider date range."
                      : "No ads match the current format filter."}
                  </td>
                </tr>
              )}
              {hierarchy.flatMap((c, ci) => {
                const statusPill = (s: string, size: "lg" | "sm" = "lg") => (
                  <span
                    className={`rounded-full font-semibold uppercase ${size === "lg" ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[9px]"}`}
                    style={{
                      background: s === "ACTIVE" ? `${SAGE}22` : `${MUTED}22`,
                      color: s === "ACTIVE" ? SAGE : MUTED,
                    }}
                  >
                    {s}
                  </span>
                );
                const blank = <td className="px-3 py-2 text-right" style={{ color: MUTED }}>—</td>;
                const isCampOpen = expandedCampaigns.has(c.name);
                const rows: React.ReactNode[] = [
                  <tr key={`c-${ci}`} className="border-t cursor-pointer hover:bg-neutral-50" style={{ borderColor: CREAM }} onClick={() => toggleCampaign(c.name)}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: INK }} title={c.name}>
                      <div className="flex items-center gap-1.5">
                        {c.adSets.length > 0 ? (
                          isCampOpen ? <ChevronDown size={14} style={{ color: MUTED }} /> : <ChevronRight size={14} style={{ color: MUTED }} />
                        ) : <span style={{ width: 14, display: "inline-block" }} />}
                        <span className="truncate">{c.name}</span>
                        <span className="text-[10px] font-normal" style={{ color: MUTED }}>
                          · {c.adSets.length} ad set{c.adSets.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[11px]" style={{ color: MUTED }}>—</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: INK }}>{formatInr(c.spend)}</td>
                    {blank}{blank}{blank}{blank}{blank}
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2.5">{statusPill(c.status, "lg")}</td>
                  </tr>,
                ];

                if (isCampOpen) {
                  c.adSets.forEach((as, asi) => {
                    const setKey = `${c.name}|${as.name}`;
                    const isSetOpen = expandedAdSets.has(setKey);
                    rows.push(
                      <tr key={`c-${ci}-as-${asi}`} className="border-t cursor-pointer hover:bg-neutral-50" style={{ borderColor: CREAM, background: "#fafaf7" }} onClick={() => toggleAdSet(setKey)}>
                        <td className="px-3 py-2 pl-8" style={{ color: INK }} title={as.name}>
                          <div className="flex items-center gap-1.5">
                            {as.ads.length > 0 ? (
                              isSetOpen ? <ChevronDown size={12} style={{ color: MUTED }} /> : <ChevronRight size={12} style={{ color: MUTED }} />
                            ) : <span style={{ width: 12, display: "inline-block" }} />}
                            <span className="text-[13px] truncate">{as.name}</span>
                            <span className="text-[10px] font-normal" style={{ color: MUTED }}>
                              · {as.ads.length} ad{as.ads.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: MUTED }}>—</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: INK }}>{formatInr(as.spend)}</td>
                        {blank}{blank}{blank}{blank}{blank}
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2">{statusPill(as.status, "sm")}</td>
                      </tr>
                    );

                    if (isSetOpen) {
                      as.ads.forEach((ad, ai) => {
                        const isSelected = ad.adId === selectedId;
                        const roasColor = ad.roas >= 2 ? SAGE : ad.roas >= 1 ? AMBER : ROSE;
                        const hookRate = weightedAvg(ad, "hookRate");
                        const holdRate = weightedAvg(ad, "holdRate");
                        const hookQuality =
                          hookRate >= 30 ? { label: "Good", color: SAGE }
                          : hookRate >= 20 ? { label: "Decent", color: AMBER }
                          : { label: "Poor", color: ROSE };
                        const holdQuality =
                          holdRate >= 15 ? { label: "Good", color: SAGE }
                          : holdRate >= 10 ? { label: "Decent", color: AMBER }
                          : { label: "Poor", color: ROSE };
                        const fmt = normalizeFormat(ad.creativeType);
                        const fatigue =
                          ad.avgFrequency > 3 ? { label: "Fatigued", color: ROSE }
                          : ad.avgFrequency > 2 ? { label: "Tiring", color: AMBER }
                          : { label: "Fresh", color: SAGE };
                        const adStatus =
                          ad.status !== "ACTIVE" ? { label: "Paused", color: MUTED }
                          : ad.roas < 1 && ad.spend > 1000 ? { label: "Pause?", color: ROSE }
                          : { label: "Running", color: SAGE };
                        rows.push(
                          <tr
                            key={`c-${ci}-as-${asi}-ad-${ai}`}
                            onClick={() => selectAndScroll(ad.adId)}
                            className="border-t cursor-pointer transition-colors"
                            style={{
                              borderColor: CREAM,
                              background: isSelected ? `${AMBER}18` : "#f5f5f0",
                            }}
                          >
                            <td className="px-3 py-1.5 pl-16 text-[12px]" style={{ color: INK }} title={ad.name}>
                              <div className="flex items-center gap-2">
                                {ad.thumbnailUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={ad.thumbnailUrl} alt="" className="h-6 w-6 rounded object-cover flex-shrink-0" style={{ background: CREAM }} />
                                ) : (
                                  <div
                                    className="h-6 w-6 rounded flex items-center justify-center flex-shrink-0 font-bold text-white text-[10px]"
                                    style={{ background: `linear-gradient(135deg, ${thumbColor(ad.name)}, ${thumbColor(ad.name)}cc)` }}
                                  >
                                    {thumbInitial(ad.name)}
                                  </div>
                                )}
                                <span className="truncate">{ad.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <span className="rounded-full px-2 py-0.5 text-[10px] capitalize" style={{ background: CREAM_BG, color: INK }}>{fmt}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: INK }}>{formatInr(ad.spend)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {hookRate > 0 ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-semibold" style={{ color: hookQuality.color }}>{hookRate.toFixed(0)}%</span>
                                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none" style={{ background: `${hookQuality.color}22`, color: hookQuality.color }}>{hookQuality.label}</span>
                                </div>
                              ) : <span style={{ color: MUTED }}>—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {holdRate > 0 ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-semibold" style={{ color: holdQuality.color }}>{holdRate.toFixed(0)}%</span>
                                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none" style={{ background: `${holdQuality.color}22`, color: holdQuality.color }}>{holdQuality.label}</span>
                                </div>
                              ) : <span style={{ color: MUTED }}>—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: INK }}>{ad.ctr.toFixed(2)}%</td>
                            <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: ad.purchases > 0 ? INK : MUTED }}>
                              {ad.purchases > 0 ? formatInr(ad.cpa) : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: roasColor }}>{ad.roas.toFixed(2)}x</td>
                            <td className="px-3 py-1.5">
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${fatigue.color}22`, color: fatigue.color }}>{fatigue.label}</span>
                            </td>
                            <td className="px-3 py-1.5">
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${adStatus.color}22`, color: adStatus.color }}>{adStatus.label}</span>
                            </td>
                          </tr>
                        );
                      });
                    }
                  });
                }

                return rows;
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Side panels: Alerts / Top by ROAS / Spend by Objective */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Alerts — derived from current ads */}
        <section className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold" style={{ color: INK }}>Alerts</h3>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${ROSE}22`, color: ROSE }}>
              {data.ads.filter((a) => (a.status === "ACTIVE" && a.roas < 1 && a.spend > 1000) || a.avgFrequency > 3 || (a.status === "ACTIVE" && a.ctr < 0.5)).length}
            </span>
          </div>
          <div className="space-y-2">
            {(() => {
              const items: { tone: "rose" | "amber"; text: string }[] = [];
              for (const a of data.ads) {
                if (a.status === "ACTIVE" && a.roas < 1 && a.spend > 1000) {
                  items.push({ tone: "rose", text: `${a.name.slice(0, 40)} CPA ${a.purchases > 0 ? formatInr(a.cpa) : "—"} ROAS ${a.roas.toFixed(2)}× over target` });
                }
                if (a.avgFrequency > 3) {
                  items.push({ tone: "amber", text: `${a.name.slice(0, 40)} frequency ${a.avgFrequency.toFixed(1)}×` });
                }
                if (a.status === "ACTIVE" && a.ctr < 0.5 && a.spend > 1000) {
                  items.push({ tone: "amber", text: `${a.name.slice(0, 40)} CTR ${a.ctr.toFixed(2)}% dropping` });
                }
              }
              if (items.length === 0) {
                return (
                  <p className="text-sm italic" style={{ color: MUTED }}>
                    All ads healthy 🎉
                  </p>
                );
              }
              return items.slice(0, 4).map((it, i) => (
                <div
                  key={i}
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{
                    background: it.tone === "rose" ? `${ROSE}10` : `${AMBER}10`,
                    color: it.tone === "rose" ? ROSE : AMBER,
                  }}
                >
                  <span className="mr-1">{it.tone === "rose" ? "⊘" : "⚠"}</span>
                  {it.text}
                </div>
              ));
            })()}
          </div>
        </section>

        {/* Top creative by ROAS */}
        <section className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
          <h3 className="mb-3 text-base font-semibold" style={{ color: INK }}>Top creative by ROAS</h3>
          <div className="space-y-2">
            {data.ads.length === 0 ? (
              <p className="text-sm italic" style={{ color: MUTED }}>No ads with spend</p>
            ) : (
              [...data.ads]
                .filter((a) => a.spend > 0)
                .sort((a, b) => b.roas - a.roas)
                .slice(0, 4)
                .map((a, i) => (
                  <div key={a.adId} className="flex items-baseline gap-2 text-sm">
                    <span className="font-mono text-xs" style={{ color: MUTED, width: 18 }}>{i + 1}</span>
                    <span className="flex-1 truncate" style={{ color: INK }} title={a.name}>
                      {a.name}
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: a.roas >= 2 ? SAGE : a.roas >= 1 ? AMBER : ROSE }}>
                      {a.roas.toFixed(1)}×
                    </span>
                  </div>
                ))
            )}
          </div>
        </section>

        {/* Spend by objective — derived from campaign names (best-effort grouping) */}
        <section className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
          <h3 className="mb-3 text-base font-semibold" style={{ color: INK }}>Spend by campaign</h3>
          <div className="space-y-3">
            {(() => {
              // Group ads by campaign name, sum spend
              const byCampaign = new Map<string, number>();
              for (const a of data.ads) {
                byCampaign.set(a.campaignName, (byCampaign.get(a.campaignName) ?? 0) + a.spend);
              }
              const sorted = Array.from(byCampaign.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
              const total = sorted.reduce((s, [, v]) => s + v, 0);
              const palette = ["#6366f1", SAGE, AMBER, ROSE];
              if (total === 0) {
                return <p className="text-sm italic" style={{ color: MUTED }}>No spend in window</p>;
              }
              return sorted.map(([name, spend], i) => {
                const pct = total > 0 ? (spend / total) * 100 : 0;
                return (
                  <div key={name}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="truncate" style={{ color: INK }} title={name}>{name.slice(0, 28)}</span>
                      <span className="font-semibold tabular-nums" style={{ color: INK }}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: CREAM }}>
                      <div className="h-full" style={{ width: `${pct}%`, background: palette[i % palette.length] }} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </section>
      </div>

      {/* Drill-down */}
      {selected && (
        <section ref={drillRef} className="rounded-2xl border shadow-sm overflow-hidden scroll-mt-4" style={{ background: "white", borderColor: BORDER }}>
          <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: BORDER }}>
            <h2 className="text-lg font-semibold" style={{ color: INK }}>Drill-down</h2>
            <span className="text-xs italic" style={{ color: MUTED }}>showing daily breakdown for selected ad</span>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Ad</label>
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400 max-w-xs"
                style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
              >
                {filteredAds.map((a) => (
                  <option key={a.adId} value={a.adId}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-5 space-y-6">
            {/* Hero strip */}
            <div className="flex flex-col sm:flex-row gap-5">
              {selected.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.thumbnailUrl}
                  alt=""
                  className="rounded-2xl object-cover flex-shrink-0"
                  style={{ width: 180, height: 220, background: CREAM }}
                />
              ) : (
                <div
                  className="rounded-2xl flex items-center justify-center text-white font-bold flex-shrink-0"
                  style={{
                    width: 180,
                    height: 220,
                    fontSize: 64,
                    background: `linear-gradient(135deg, ${thumbColor(selected.name)}, ${thumbColor(selected.name)}aa)`,
                  }}
                >
                  {thumbInitial(selected.name)}
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-4">
                <div>
                  <h3 className="text-xl font-bold break-words" style={{ color: INK }}>{selected.name}</h3>
                  <p className="text-sm mt-1" style={{ color: MUTED }}>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase mr-2"
                      style={{
                        background: selected.status === "ACTIVE" ? `${SAGE}22` : `${MUTED}22`,
                        color: selected.status === "ACTIVE" ? SAGE : MUTED,
                      }}
                    >
                      {selected.status}
                    </span>
                    {selected.campaignName} · {selected.adSetName} · {selected.daysRunning}d running
                    {selected.previewLink && (
                      <>
                        {" · "}
                        <a
                          href={selected.previewLink}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="underline hover:no-underline"
                          style={{ color: AMBER }}
                        >
                          Preview ↗
                        </a>
                      </>
                    )}
                  </p>
                </div>

                {/* Funnel verdict cards — Top → Mid → Bottom */}
                {(() => {
                  const ad = selected;
                  const cpm = ad.impressions > 0 ? (ad.spend / ad.impressions) * 1000 : 0;
                  const hookRate = weightedAvg(ad, "hookRate");
                  const holdRate = weightedAvg(ad, "holdRate");
                  const purchaseCvr = ad.clicks > 0 ? (ad.purchases / ad.clicks) * 100 : 0;
                  const cpp = ad.purchases > 0 ? ad.spend / ad.purchases : 0;
                  const roasColor = ad.roas >= 2 ? SAGE : ad.roas >= 1 ? AMBER : ROSE;
                  return (
                    <div className="space-y-4">
                      {/* HEADLINE — Spend / Revenue / ROAS */}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
                          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>Total spent</p>
                          <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{formatInr(ad.spend)}</p>
                        </div>
                        <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
                          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>Revenue from this ad</p>
                          <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{formatInr(ad.purchaseValue)}</p>
                        </div>
                        <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
                          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>ROAS</p>
                          <p className="text-2xl font-bold tabular-nums" style={{ color: roasColor }}>{ad.roas.toFixed(2)}x</p>
                        </div>
                      </div>

                      {/* TOP OF FUNNEL — ATTENTION */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
                          Top of funnel — attention
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                          <VerdictCard
                            title="CPM"
                            subtitle="Cost to reach 1,000 people"
                            value={cpm}
                            formatted={`₹${Math.round(cpm)}`}
                            target={{ from: 80, to: 150 }}
                            caption="Benchmark ₹80–₹150"
                            lowerIsBetter
                          />
                          <VerdictCard
                            title="CTR"
                            subtitle="% who clicked after seeing the ad"
                            value={ad.ctr}
                            formatted={`${ad.ctr.toFixed(2)}%`}
                            target={{ from: 1.5, to: 2 }}
                            caption="Benchmark 1.5–2%+"
                          />
                          <VerdictCard
                            title="Hook rate"
                            subtitle="% who watched the first 3 seconds"
                            value={hookRate}
                            formatted={`${hookRate.toFixed(0)}%`}
                            target={{ from: 25, to: 30 }}
                            caption="Benchmark 25–30%+"
                          />
                          <VerdictCard
                            title="ThruPlay"
                            subtitle="% who watched at least a quarter of the video"
                            value={holdRate}
                            formatted={`${holdRate.toFixed(0)}%`}
                            target={{ from: 40, to: 50 }}
                            caption="Benchmark 40–50%+"
                          />
                          <VerdictCard
                            title="Frequency"
                            subtitle="Avg. times one person saw your ad"
                            value={ad.avgFrequency}
                            formatted={`${ad.avgFrequency.toFixed(2)}×`}
                            target={{ from: 3, to: 4 }}
                            caption="Keep below 3–4×/week"
                            lowerIsBetter
                          />
                        </div>
                      </div>

                      {/* MID FUNNEL — INTENT */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
                          Mid funnel — intent
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <VerdictCard
                            title="CPC"
                            subtitle="Cost per click — reflects CPM and CTR combined"
                            value={ad.cpc}
                            formatted={`₹${Math.round(ad.cpc)}`}
                            target={{ from: 10, to: 30 }}
                            caption="Benchmark ₹10–₹30"
                            lowerIsBetter
                          />
                          <VerdictCard
                            title="Landing page CTR"
                            subtitle="% of ad clicks that actually load the landing page"
                            value={ad.clicks > 0 ? (ad.landingPageViews / ad.clicks) * 100 : 0}
                            formatted={ad.clicks > 0 ? `${((ad.landingPageViews / ad.clicks) * 100).toFixed(2)}%` : "—"}
                            target={{ from: 70, to: 80 }}
                            caption="Benchmark 70–80%+ of clicks"
                            noData={ad.clicks === 0}
                          />
                        </div>
                      </div>

                      {/* BOTTOM OF FUNNEL — REVENUE */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
                          Bottom of funnel — revenue
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <VerdictCard
                            title="Purchase CVR"
                            subtitle="% of landing-page visitors who bought"
                            value={purchaseCvr}
                            formatted={`${purchaseCvr.toFixed(1)}%`}
                            target={{ from: 1.5, to: 3 }}
                            caption="Benchmark 1.5–3%"
                          />
                          <VerdictCard
                            title="CPP"
                            subtitle="Total spend ÷ number of purchases"
                            value={cpp}
                            formatted={ad.purchases > 0 ? `₹${Math.round(cpp).toLocaleString("en-IN")}` : "—"}
                            target={{ from: 600, to: 1500 }}
                            caption="Target ₹600–₹1,500"
                            lowerIsBetter
                            noData={ad.purchases === 0}
                          />
                        </div>
                      </div>

                      {/* CONVERSION FUNNEL — Clicks → ATC → Checkout → Purchase */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
                          Conversion funnel — clicks to purchase
                        </p>
                        {(() => {
                          // Each stage has a count and a benchmark for the *transition*
                          // INTO it (what % of the previous stage should land here).
                          const stages: {
                            label: string;
                            count: number;
                            benchmark?: { good: number; decent: number; label: string };
                          }[] = [
                            { label: "Clicks", count: ad.clicks },
                            {
                              label: "Landing Page",
                              count: ad.landingPageViews,
                              benchmark: { good: 70, decent: 50, label: "70–80%+ of clicks" },
                            },
                            {
                              label: "Add to Cart",
                              count: ad.addToCart,
                              benchmark: { good: 10, decent: 5, label: "5–15% of LP" },
                            },
                            {
                              label: "Checkout",
                              count: ad.initiateCheckout,
                              benchmark: { good: 50, decent: 30, label: "40–60% of ATC" },
                            },
                            {
                              label: "Purchase",
                              count: ad.purchases,
                              benchmark: { good: 60, decent: 40, label: "50–70% of checkout" },
                            },
                          ];

                          // Per-stage quality + identify the weakest transition
                          type StageQuality = "good" | "decent" | "poor" | "na";
                          const qualities: StageQuality[] = stages.map((s, i) => {
                            const prev = i > 0 ? stages[i - 1].count : null;
                            if (prev == null || prev === 0 || !s.benchmark) return "na";
                            const pct = (s.count / prev) * 100;
                            if (pct >= s.benchmark.good) return "good";
                            if (pct >= s.benchmark.decent) return "decent";
                            return "poor";
                          });
                          const goodCount = qualities.filter((q) => q === "good").length;
                          const poorCount = qualities.filter((q) => q === "poor").length;
                          const decentCount = qualities.filter((q) => q === "decent").length;
                          const evalCount = goodCount + decentCount + poorCount;
                          // Find weakest transition (lowest ratio of pct to benchmark.good)
                          let weakestIdx = -1;
                          let weakestRatio = Infinity;
                          for (let i = 1; i < stages.length; i++) {
                            const prev = stages[i - 1].count;
                            const bm = stages[i].benchmark;
                            if (!bm || prev === 0) continue;
                            const pct = (stages[i].count / prev) * 100;
                            const ratio = pct / bm.good;
                            if (ratio < weakestRatio) {
                              weakestRatio = ratio;
                              weakestIdx = i;
                            }
                          }
                          const verdict =
                            evalCount === 0
                              ? { tone: "na" as const, label: "No data", body: "Not enough data to evaluate the funnel." }
                              : poorCount === 0 && goodCount === evalCount
                              ? { tone: "good" as const, label: "Healthy funnel", body: "Every stage is at or above industry benchmark." }
                              : poorCount === 0
                              ? { tone: "decent" as const, label: "Decent funnel", body: `${goodCount} stage${goodCount === 1 ? "" : "s"} good, ${decentCount} need attention.` }
                              : poorCount >= 2
                              ? { tone: "bad" as const, label: "Funnel broken", body: `${poorCount} stages below benchmark. Bottleneck: ${stages[weakestIdx]?.label ?? "—"}.` }
                              : { tone: "bad" as const, label: "Leaky funnel", body: `Bottleneck: ${stages[weakestIdx]?.label ?? "—"} (below benchmark).` };
                          const verdictColor =
                            verdict.tone === "good" ? SAGE :
                            verdict.tone === "decent" ? AMBER :
                            verdict.tone === "bad" ? ROSE : MUTED;

                          return (
                            <div className="space-y-3">
                              <div className="flex items-stretch gap-2 overflow-x-auto">
                                {stages.map((s, i) => {
                                  const prev = i > 0 ? stages[i - 1].count : null;
                                  const passPct = prev != null && prev > 0
                                    ? Math.round((s.count / prev) * 100)
                                    : null;
                                  const bm = s.benchmark;
                                  const q = qualities[i];
                                  const passColor =
                                    q === "good" ? SAGE :
                                    q === "decent" ? AMBER :
                                    q === "poor" ? ROSE : MUTED;
                                  return (
                                    <div key={s.label} className="flex items-stretch flex-1 min-w-0 gap-2">
                                      {i > 0 && (
                                        <div className="flex flex-col items-center justify-center shrink-0 min-w-[72px]">
                                          <span
                                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                                            style={{ background: `${passColor}22`, color: passColor }}
                                          >
                                            {passPct == null ? "—" : `${passPct}%`}
                                          </span>
                                          {bm && (
                                            <span
                                              className="text-[9px] leading-tight text-center mt-1"
                                              style={{ color: MUTED }}
                                            >
                                              std {bm.label.replace(/^(\d+)–(\d+)%?\+? of .+/, "$1–$2%")}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      <div
                                        className="rounded-xl border px-4 py-3 flex-1 min-w-[110px]"
                                        style={{
                                          borderColor: i === 0 ? BORDER : `${passColor}55`,
                                          background: i === 0 ? CREAM_BG : `${passColor}10`,
                                        }}
                                      >
                                        <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: INK }}>
                                          {s.count.toLocaleString("en-IN")}
                                        </p>
                                        <p className="text-[10px] mt-1" style={{ color: MUTED }}>
                                          {s.label}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Overall funnel verdict */}
                              <div
                                className="rounded-xl border p-3 flex items-center gap-3"
                                style={{
                                  background: `${verdictColor}15`,
                                  borderColor: `${verdictColor}55`,
                                }}
                              >
                                <span
                                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
                                  style={{ background: `${verdictColor}33`, color: verdictColor }}
                                >
                                  {verdict.label}
                                </span>
                                <span className="text-[12px]" style={{ color: INK }}>
                                  {verdict.body}
                                </span>
                                {evalCount > 0 && (
                                  <span className="ml-auto text-[10px] whitespace-nowrap" style={{ color: MUTED }}>
                                    {goodCount} good · {decentCount} decent · {poorCount} poor
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* VERDICT NOTES — ROAS / Creative / Hook */}
                      {(() => {
                        const notes: { title: string; body: string; tone: "good" | "warn" | "bad" }[] = [];
                        if (ad.purchases === 0) {
                          notes.push({
                            tone: "bad",
                            title: "No purchase data",
                            body: "No purchases attributed this window. Monitor or review audience match.",
                          });
                        } else if (ad.roas >= 1.8) {
                          notes.push({
                            tone: "good",
                            title: "ROAS on target",
                            body: `${ad.roas.toFixed(2)}x ROAS — profitable. Scaling candidate.`,
                          });
                        } else if (ad.roas >= 1) {
                          notes.push({
                            tone: "warn",
                            title: "ROAS below target",
                            body: `${ad.roas.toFixed(2)}x ROAS — breaking even on ad spend. Post-click funnel review recommended.`,
                          });
                        } else {
                          notes.push({
                            tone: "bad",
                            title: "ROAS underperforming",
                            body: `${ad.roas.toFixed(2)}x ROAS — losing money on ad spend. Pause or review immediately.`,
                          });
                        }
                        if (ad.ctr >= 2) {
                          notes.push({
                            tone: "good",
                            title: "Strong creative pull",
                            body: `CTR at ${ad.ctr.toFixed(2)}% is above the 2% benchmark. Ad is stopping the scroll.`,
                          });
                        } else if (ad.ctr >= 1.5) {
                          notes.push({
                            tone: "warn",
                            title: "Decent creative pull",
                            body: `CTR at ${ad.ctr.toFixed(2)}% is in range but has room to improve.`,
                          });
                        } else {
                          notes.push({
                            tone: "bad",
                            title: "Weak creative pull",
                            body: `CTR at ${ad.ctr.toFixed(2)}% is below 1.5%. Creative needs refresh.`,
                          });
                        }
                        if (hookRate >= 25) {
                          notes.push({
                            tone: "good",
                            title: "Hook rate healthy",
                            body: `${hookRate.toFixed(1)}% of viewers watched past 3 seconds.`,
                          });
                        } else if (hookRate >= 20) {
                          notes.push({
                            tone: "warn",
                            title: "Hook borderline",
                            body: `${hookRate.toFixed(1)}% hook rate — just under the 25% benchmark.`,
                          });
                        } else {
                          notes.push({
                            tone: "bad",
                            title: "Hook needs work",
                            body: `Only ${hookRate.toFixed(1)}% hook rate. First 3 seconds not grabbing attention.`,
                          });
                        }
                        const toneColor = (t: "good" | "warn" | "bad") =>
                          t === "good" ? SAGE : t === "warn" ? AMBER : ROSE;
                        return (
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {notes.map((n) => (
                              <div
                                key={n.title}
                                className="rounded-xl border p-3"
                                style={{
                                  background: `${toneColor(n.tone)}10`,
                                  borderColor: `${toneColor(n.tone)}55`,
                                }}
                              >
                                <p className="text-[12px] font-semibold mb-1" style={{ color: toneColor(n.tone) }}>
                                  {n.title}
                                </p>
                                <p className="text-[11px]" style={{ color: INK }}>
                                  {n.body}
                                </p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* Health badges */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {(() => {
                    const r = rankingLabel(selected.qualityRanking);
                    return r ? (
                      <span
                        className="rounded-full px-2.5 py-1 font-semibold"
                        style={{ background: `${r.color}22`, color: r.color }}
                      >
                        Quality: {r.label}
                      </span>
                    ) : null;
                  })()}
                  {(() => {
                    const r = rankingLabel(selected.engagementRateRanking);
                    return r ? (
                      <span
                        className="rounded-full px-2.5 py-1 font-semibold"
                        style={{ background: `${r.color}22`, color: r.color }}
                      >
                        Engagement: {r.label}
                      </span>
                    ) : null;
                  })()}
                  {(() => {
                    const r = rankingLabel(selected.conversionRateRanking);
                    return r ? (
                      <span
                        className="rounded-full px-2.5 py-1 font-semibold"
                        style={{ background: `${r.color}22`, color: r.color }}
                      >
                        Conversion: {r.label}
                      </span>
                    ) : null;
                  })()}
                  {selected.avgFrequency > 3 && (
                    <span
                      className="rounded-full px-2.5 py-1 font-semibold flex items-center gap-1"
                      style={{ background: `${ROSE}22`, color: ROSE }}
                    >
                      <Sparkles size={10} /> Fatigued (freq {selected.avgFrequency.toFixed(1)}×)
                    </span>
                  )}
                  {selected.roas >= 2 && (
                    <span
                      className="rounded-full px-2.5 py-1 font-semibold flex items-center gap-1"
                      style={{ background: `${SAGE}22`, color: SAGE }}
                    >
                      <TrendingUp size={10} /> Top performer
                    </span>
                  )}
                  {selected.roas < 1 && selected.spend > 1000 && (
                    <span
                      className="rounded-full px-2.5 py-1 font-semibold"
                      style={{ background: `${ROSE}22`, color: ROSE }}
                    >
                      ⚠ Killer — losing money
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* MONEY FLOW */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Money flow</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ChartCard
                  title="Spend"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.spend }))}
                  formatY={(v) => formatInr(v)}
                  chartType="bar"
                  color={ROSE}
                />
                <ChartCard
                  title="ROAS"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.purchaseValue / Math.max(d.spend, 1) }))}
                  formatY={(v) => `${v.toFixed(1)}x`}
                  formatTip={(v) => `${v.toFixed(2)}x`}
                  chartType="area"
                  color={SAGE}
                  threshold={1}
                  thresholdLabel="break-even"
                  benchmark={{ good: 2, decent: 1, unit: "x" }}
                />
                <ChartCard
                  title="Purchases"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.purchases }))}
                  formatY={(v) => `${v}`}
                  chartType="bar"
                  color={VIOLET}
                />
                <ChartCard
                  title="CPA"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.purchases > 0 ? d.spend / d.purchases : 0 }))}
                  formatY={(v) => formatInr(v)}
                  chartType="line"
                  color={AMBER}
                />
              </div>
            </div>

            {/* ENGAGEMENT */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Engagement</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ChartCard
                  title="CTR"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0 }))}
                  formatY={(v) => `${v.toFixed(1)}%`}
                  chartType="line"
                  color="#8b5cf6"
                  benchmark={{ good: 2, decent: 1, unit: "%" }}
                />
                <ChartCard
                  title="Hook rate"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.hookRate }))}
                  formatY={(v) => `${v.toFixed(0)}%`}
                  chartType="area"
                  color={TEAL}
                  benchmark={{ good: 30, decent: 20, unit: "%" }}
                />
                <ChartCard
                  title="Hold rate"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.holdRate }))}
                  formatY={(v) => `${v.toFixed(0)}%`}
                  chartType="area"
                  color={SAGE}
                  benchmark={{ good: 15, decent: 10, unit: "%" }}
                />
                <ChartCard
                  title="Frequency"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.frequency }))}
                  formatY={(v) => `${v.toFixed(1)}x`}
                  chartType="line"
                  color={INK}
                  warnZone={{ from: 3, color: ROSE }}
                  thresholdLabel="fatigue"
                  benchmark={{ good: 2, decent: 3, unit: "x", lowerIsBetter: true }}
                />
              </div>
            </div>

          </div>
        </section>
      )}
    </div>
  );
}
