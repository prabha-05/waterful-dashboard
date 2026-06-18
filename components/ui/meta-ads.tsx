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
} from "lucide-react";

const INK = "#ffffff";
const MUTED = "#94a3b8";
const AMBER = "#f97316";
const SAGE = "#10b981";
const ROSE = "#ef4444";
const VIOLET = "#8b5cf6";
const TEAL = "#0d9488";
const CREAM = "#1e293b";
const CREAM_BG = "#0f172a";
const BORDER = "#1e293b";

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
  effectiveStatus: string | null;
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

// Derives the rich status label for an ad. Combines what the user set
// (status: ACTIVE/PAUSED) with what Meta's actually doing
// (effectiveStatus: ACTIVE / ADSET_PAUSED / CAMPAIGN_PAUSED /
// WITH_ISSUES / …), so the dashboard surfaces ads that look ON but
// are silently blocked by a paused parent or flagged by Meta.
function deriveAdStatus(ad: Pick<Ad, "status" | "effectiveStatus" | "roas" | "spend">): {
  label: string;
  color: string;
} {
  if (ad.status !== "ACTIVE") return { label: "Paused", color: MUTED };
  const eff = ad.effectiveStatus || "";
  if (eff === "ADSET_PAUSED") return { label: "Ad set off", color: MUTED };
  if (eff === "CAMPAIGN_PAUSED") return { label: "Campaign off", color: MUTED };
  if (eff === "WITH_ISSUES") return { label: "Meta flagged", color: ROSE };
  // Effective status is ACTIVE (or unknown — treat as running).
  if (ad.roas < 1 && ad.spend > 1000) return { label: "Pause?", color: ROSE };
  return { label: "Running", color: SAGE };
}

// Renders an ad thumbnail with a graceful fallback. If the URL is null
// OR the image fails to load (stale Meta CDN token), we drop back to a
// coloured initial-letter tile instead of showing a broken-image icon.
function AdThumbnail({
  url,
  name,
  size,
  big = false,
}: {
  url: string | null | undefined;
  name: string;
  size: number;
  big?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = url && !failed;
  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url!}
        alt=""
        // Facebook's CDN rejects requests whose Referer is not facebook.com,
        // so strip the referrer to let third-party sites embed thumbnails.
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`object-cover flex-shrink-0 ${big ? "rounded-2xl" : "rounded"}`}
        style={{ width: size, height: big ? Math.round(size * 1.22) : size, background: CREAM }}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 font-bold text-white ${big ? "rounded-2xl" : "rounded"}`}
      style={{
        width: size,
        height: big ? Math.round(size * 1.22) : size,
        fontSize: big ? Math.round(size * 0.36) : Math.max(10, Math.round(size * 0.42)),
        background: `linear-gradient(135deg, ${thumbColor(name)}, ${thumbColor(name)}cc)`,
      }}
    >
      {thumbInitial(name)}
    </div>
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
        background: noData ? "#0f172a" : `${quality.color}33`,
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
      style={{ background: "#0f172a", borderColor: BORDER }}
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
  // Applied filters — what the table actually uses.
  const [formatFilter, setFormatFilter] = useState<"ALL" | "video" | "image" | "carousel">("ALL");
  const [minSpend, setMinSpend] = useState<number>(5000);

  // Draft filters — what the user is typing/clicking before pressing Apply.
  // Keeps the table from re-filtering on every keystroke (and gives the
  // user explicit control over when changes take effect).
  const [draftFormat, setDraftFormat] = useState<"ALL" | "video" | "image" | "carousel">("ALL");
  const [draftMinSpend, setDraftMinSpend] = useState<number>(5000);
  const filtersDirty = draftFormat !== formatFilter || draftMinSpend !== minSpend;
  const applyFilters = () => {
    setFormatFilter(draftFormat);
    setMinSpend(draftMinSpend);
  };
  const drillRef = useRef<HTMLElement | null>(null);

  const selectAndScroll = (adId: number) => {
    setSelectedId(adId);
    // Defer to next frame so the drill section is mounted before we scroll
    requestAnimationFrame(() => {
      drillRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  // Sort key: by spend, hook rate, ROAS, CTR, frequency
  // Column-based sort: click a header to sort by that column; click the
  // same header again to flip direction. Defaults to spend descending.
  type SortKey = "spend" | "purchases" | "roas" | "hookRate" | "thruplay" | "ctr" | "cpp" | "fatigue";
  const [sortBy, setSortBy] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  // Fresh thumbnail URLs keyed by metaAdId. Stored Meta CDN URLs expire
  // within hours, so we re-fetch live URLs after the ad list loads and
  // shadow the stale `thumbnailUrl` on each ad.
  const [freshThumbs, setFreshThumbs] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/meta/ads?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        if (cancelled) return;
        setData(d);
        // Kick off a background refresh of thumbnail URLs.
        const ids = Array.from(new Set(d.ads.map((a) => a.metaAdId).filter(Boolean)));
        if (ids.length > 0) {
          fetch(`/api/meta/ad-thumbnails?ids=${ids.join(",")}`)
            .then((r) => (r.ok ? r.json() : {}))
            .then((m: Record<string, string | null>) => {
              if (!cancelled) setFreshThumbs(m);
            })
            .catch(() => { /* swallow — fallback letter handles it */ });
        }
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
    const valueOf = (a: typeof filtered[number]): number => {
      switch (sortBy) {
        case "purchases": return a.purchases;
        case "roas":      return a.roas;
        case "hookRate":  return weightedAvg(a, "hookRate");
        case "thruplay":  return weightedAvg(a, "holdRate");
        case "ctr":       return a.ctr;
        case "cpp":       return a.purchases > 0 ? a.cpa : Number.POSITIVE_INFINITY;
        case "fatigue":   return a.avgFrequency;
        default:          return a.spend;
      }
    };
    const sorted = [...filtered].sort((a, b) => {
      const diff = valueOf(a) - valueOf(b);
      return sortDir === "desc" ? -diff : diff;
    });
    return sorted;
  }, [data, formatFilter, minSpend, sortBy, sortDir]);

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
      style={{ background: "#0f172a", borderColor: BORDER }}
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

  return (
    <div className={`space-y-6 ${loading ? "opacity-70 transition-opacity" : ""}`}>
      {filterBar}

      {/* Ads table */}
      <section className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: "#0f172a", borderColor: BORDER }}>
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
              borderColor: draftMinSpend > 0 ? SAGE : BORDER,
              background: draftMinSpend > 0 ? `${SAGE}15` : CREAM_BG,
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
              value={draftMinSpend || ""}
              onChange={(e) => setDraftMinSpend(Math.max(0, Number(e.target.value) || 0))}
              onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
              placeholder="0"
              className="w-24 bg-transparent outline-none text-sm font-semibold tabular-nums"
              style={{ color: INK }}
            />
          </div>
          <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: BORDER }}>
            {(["video", "image", "carousel"] as const).map((f) => {
              const active = draftFormat === f;
              return (
                <button
                  key={f}
                  // Click the active pill again to clear (no "All" button needed).
                  onClick={() => setDraftFormat(active ? "ALL" : f)}
                  className="px-3 py-1.5 text-xs font-medium capitalize transition-colors"
                  style={{
                    background: active ? "#6366f1" : "#1e293b",
                    color: active ? "white" : "#cbd5e1",
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>
          <button
            onClick={applyFilters}
            disabled={!filtersDirty}
            className="rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: filtersDirty ? INK : `${INK}88`,
              color: "white",
            }}
            title={filtersDirty ? "Apply filter changes" : "Filters already applied"}
          >
            Apply
          </button>
        </div>
        <div className="overflow-x-auto">
          {(() => {
            const showVideoMetrics = formatFilter === "ALL" || formatFilter === "video";
            const headers = [
              { label: "Ad",         align: "left",  key: null,                videoOnly: false },
              { label: "Spend",      align: "right", key: "spend"     as SortKey, videoOnly: false },
              { label: "Purchases",  align: "right", key: "purchases" as SortKey, videoOnly: false },
              { label: "ROAS",       align: "right", key: "roas"      as SortKey, videoOnly: false },
              { label: "Hook rate",  align: "right", key: "hookRate"  as SortKey, videoOnly: true  },
              { label: "ThruPlay",   align: "right", key: "thruplay"  as SortKey, videoOnly: true  },
              { label: "CTR",        align: "right", key: "ctr"       as SortKey, videoOnly: false },
              { label: "CPP",        align: "right", key: "cpp"       as SortKey, videoOnly: false },
              { label: "Fatigue",    align: "left",  key: "fatigue"   as SortKey, videoOnly: false },
              { label: "Status",     align: "left",  key: null,                videoOnly: false },
            ].filter((h) => showVideoMetrics || !h.videoOnly);
            return (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: CREAM_BG }}>
                {headers.map((h) => {
                  const sortable = h.key !== null;
                  const active = sortable && sortBy === h.key;
                  const arrow = active ? (sortDir === "desc" ? " ▼" : " ▲") : "";
                  return (
                    <th
                      key={h.label}
                      onClick={sortable ? () => toggleSort(h.key as SortKey) : undefined}
                      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${sortable ? "cursor-pointer select-none hover:bg-orange-950/30" : ""}`}
                      style={{
                        color: active ? INK : MUTED,
                        textAlign: h.align as "left" | "right",
                      }}
                      title={sortable ? `Sort by ${h.label}` : undefined}
                    >
                      {h.label}{arrow}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredAds.length === 0 && (
                <tr>
                  <td colSpan={headers.length} className="px-3 py-12 text-center text-sm italic" style={{ color: MUTED }}>
                    {data.ads.length === 0
                      ? "No ad spend in this window. Try a wider date range."
                      : "No ads match the current filter."}
                  </td>
                </tr>
              )}
              {filteredAds.map((ad) => {
                const isSelected = ad.adId === selectedId;
                const roasColor = ad.roas >= 2 ? SAGE : ad.roas >= 1 ? AMBER : ROSE;
                const hookRate = weightedAvg(ad, "hookRate");
                const holdRate = weightedAvg(ad, "holdRate");
                const hookQuality =
                  hookRate >= 30 ? { label: "Good", color: SAGE }
                  : hookRate >= 20 ? { label: "Decent", color: AMBER }
                  : { label: "Poor", color: ROSE };
                const holdQuality =
                  holdRate >= 10 ? { label: "Good", color: SAGE }
                  : holdRate >= 5 ? { label: "Decent", color: AMBER }
                  : { label: "Poor", color: ROSE };
                const fatigue =
                  ad.avgFrequency > 3 ? { label: "Fatigued", color: ROSE }
                  : ad.avgFrequency > 2 ? { label: "Tiring", color: AMBER }
                  : { label: "Fresh", color: SAGE };
                const adStatus = deriveAdStatus(ad);
                return (
                  <tr
                    key={ad.adId}
                    onClick={() => selectAndScroll(ad.adId)}
                    className="border-t cursor-pointer transition-colors hover:bg-slate-800/60"
                    style={{
                      borderColor: BORDER,
                      background: isSelected ? `${AMBER}22` : "#0f172a",
                    }}
                  >
                    {/* Ad — thumbnail + name; Ad Set & Campaign wrap below as Excel-style multi-line text */}
                    <td className="px-3 py-2 text-[12px] align-top" style={{ color: INK, minWidth: 260, maxWidth: 360 }}>
                      <div className="flex items-start gap-2">
                        <AdThumbnail
                          url={freshThumbs[ad.metaAdId] ?? ad.thumbnailUrl}
                          name={ad.name}
                          size={32}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="font-semibold leading-snug" style={{ color: INK, wordBreak: "break-word" }}>
                            {ad.name}
                          </div>
                          <div className="text-[10px] leading-snug" style={{ color: MUTED, wordBreak: "break-word" }}>
                            <span style={{ fontWeight: 600 }}>Ad set:</span> {ad.adSetName}
                          </div>
                          <div className="text-[10px] leading-snug" style={{ color: MUTED, wordBreak: "break-word" }}>
                            <span style={{ fontWeight: 600 }}>Campaign:</span> {ad.campaignName}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Spend */}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: INK }}>
                      {formatInr(ad.spend)}
                    </td>
                    {/* Purchases */}
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: ad.purchases > 0 ? INK : MUTED }}>
                      {ad.purchases}
                    </td>
                    {/* ROAS */}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: roasColor }}>
                      {ad.roas.toFixed(2)}x
                    </td>
                    {showVideoMetrics && (
                      <>
                        {/* Hook rate */}
                        <td className="px-3 py-2 text-right tabular-nums">
                          {hookRate > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold" style={{ color: hookQuality.color }}>{hookRate.toFixed(0)}%</span>
                              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none" style={{ background: `${hookQuality.color}22`, color: hookQuality.color }}>{hookQuality.label}</span>
                            </div>
                          ) : <span style={{ color: MUTED }}>—</span>}
                        </td>
                        {/* ThruPlay = % of total viewers who watched the full video */}
                        <td className="px-3 py-2 text-right tabular-nums">
                          {holdRate > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold" style={{ color: holdQuality.color }}>{holdRate.toFixed(0)}%</span>
                              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none" style={{ background: `${holdQuality.color}22`, color: holdQuality.color }}>{holdQuality.label}</span>
                            </div>
                          ) : <span style={{ color: MUTED }}>—</span>}
                        </td>
                      </>
                    )}
                    {/* CTR */}
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: INK }}>
                      {ad.ctr.toFixed(2)}%
                    </td>
                    {/* CPP = Cost Per Purchase */}
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: ad.purchases > 0 ? INK : MUTED }}>
                      {ad.purchases > 0 ? formatInr(ad.cpa) : "—"}
                    </td>
                    {/* Fatigue */}
                    <td className="px-3 py-2">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap" style={{ background: `${fatigue.color}22`, color: fatigue.color }}>
                        {fatigue.label}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap" style={{ background: `${adStatus.color}22`, color: adStatus.color }}>
                        {adStatus.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            );
          })()}
        </div>
      </section>

      {/* Drill-down */}
      {selected && (
        <section ref={drillRef} className="rounded-2xl border shadow-sm overflow-hidden scroll-mt-4" style={{ background: "#0f172a", borderColor: BORDER }}>
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
              <AdThumbnail
                url={freshThumbs[selected.metaAdId] ?? selected.thumbnailUrl}
                name={selected.name}
                size={180}
                big
              />

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
                  const isVideo = normalizeFormat(ad.creativeType) === "video";
                  return (
                    <div className="space-y-4">
                      {/* HEADLINE — Spend / Revenue / ROAS */}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "#0f172a", borderColor: BORDER }}>
                          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>Total spent</p>
                          <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{formatInr(ad.spend)}</p>
                        </div>
                        <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "#0f172a", borderColor: BORDER }}>
                          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>Revenue from this ad</p>
                          <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{formatInr(ad.purchaseValue)}</p>
                        </div>
                        <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "#0f172a", borderColor: BORDER }}>
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
                          {isVideo && (
                            <>
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
                                subtitle="% of viewers who watched the full video"
                                value={holdRate}
                                formatted={`${holdRate.toFixed(0)}%`}
                                target={{ from: 5, to: 10 }}
                                caption="Benchmark 5–10%+"
                              />
                            </>
                          )}
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
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                            Conversion funnel — clicks to purchase
                          </p>
                          <p className="text-xs" style={{ color: MUTED }}>
                            Starting from{" "}
                            <span className="text-base font-bold tabular-nums" style={{ color: INK }}>
                              {ad.impressions.toLocaleString("en-IN")}
                            </span>{" "}
                            impressions
                          </p>
                        </div>
                        {(() => {
                          // Each stage has a count and a benchmark for the *transition*
                          // INTO it (what % of the previous stage should land here).
                          const stages: {
                            label: string;
                            count: number;
                            benchmark?: { good: number; decent: number; label: string };
                            prevOverride?: number;
                          }[] = [
                            {
                              label: "Clicks",
                              count: ad.clicks,
                              benchmark: { good: 1.5, decent: 1.0, label: "1.5%+ of impressions (India)" },
                              prevOverride: ad.impressions,
                            },
                            {
                              label: "Landing Page",
                              count: ad.landingPageViews,
                              benchmark: { good: 80, decent: 65, label: "80%+ of clicks (India)" },
                            },
                            {
                              label: "Add to Cart",
                              count: ad.addToCart,
                              benchmark: { good: 5, decent: 3, label: "5%+ of LP (India)" },
                            },
                            {
                              label: "Checkout",
                              count: ad.initiateCheckout,
                              benchmark: { good: 40, decent: 25, label: "40%+ of ATC (India)" },
                            },
                            {
                              label: "Purchase",
                              count: ad.purchases,
                              benchmark: { good: 35, decent: 20, label: "35%+ of checkout (India)" },
                            },
                          ];

                          // Per-stage quality + identify the weakest transition
                          type StageQuality = "good" | "decent" | "poor" | "na";
                          const qualities: StageQuality[] = stages.map((s, i) => {
                            const prev = i > 0 ? stages[i - 1].count : (s.prevOverride ?? null);
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
                          for (let i = 0; i < stages.length; i++) {
                            const prev = i > 0 ? stages[i - 1].count : stages[i].prevOverride;
                            const bm = stages[i].benchmark;
                            if (!bm || prev == null || prev === 0) continue;
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

                          // Build comparison data: industry benchmark (midpoint of good/decent
                          // range) vs our actual % at each transition. All 5 stages get bars
                          // — Clicks is now CTR vs impressions. Each bar also shows the
                          // absolute count next to its percentage:
                          //   - Industry bar: count we'd HAVE at this stage if we matched
                          //     the benchmark % (helps user see "industry would give us 240
                          //     here, we have 100").
                          //   - Our bar: actual count we have.
                          const comparisonStages = stages.map((s, idx) => {
                            const prev = idx > 0 ? stages[idx - 1].count : s.prevOverride;
                            const ours = prev != null && prev > 0 ? (s.count / prev) * 100 : 0;
                            const bm = s.benchmark;
                            // Indian standard = the "good" threshold (i.e. the actual benchmark
                            // you should hit, not the midpoint of a range).
                            const industry = bm ? bm.good : 0;
                            const industryExpectedCount = prev != null && prev > 0
                              ? Math.round((industry / 100) * prev)
                              : 0;
                            const q = qualities[idx];
                            const ourColor =
                              q === "good" ? SAGE :
                              q === "decent" ? AMBER :
                              q === "poor" ? ROSE : MUTED;
                            return {
                              label: s.label,
                              count: s.count,
                              ours,
                              industry,
                              industryExpectedCount,
                              color: ourColor,
                              q,
                            };
                          });

                          return (
                            <div className="space-y-3">
                              {/* Compact table: Impressions box + one column per stage
                                  (STD vs US, with % and count). Stage header turns green
                                  when we're at-or-above the Indian standard, red when below. */}
                              <div className="flex items-stretch gap-2 overflow-x-auto">
                                {/* Impressions — starting number */}
                                <div className="flex-shrink-0 rounded-md border overflow-hidden" style={{ borderColor: BORDER, background: "#0f172a", minWidth: 120 }}>
                                  <div className="px-3 py-1.5 text-center text-[11px] font-semibold" style={{ color: "#cbd5e1", background: "#1e293b" }}>
                                    Impressions
                                  </div>
                                  <div className="px-3 py-3 text-center text-[13px] font-bold tabular-nums" style={{ color: INK }}>
                                    {ad.impressions.toLocaleString("en-IN")}
                                  </div>
                                </div>

                                {comparisonStages.map((s) => {
                                  const ahead = s.ours >= s.industry;
                                  const headerColor = ahead ? SAGE : ROSE;
                                  return (
                                    <div key={s.label} className="flex-1 min-w-[140px] rounded-md border overflow-hidden" style={{ borderColor: BORDER, background: "#0f172a" }}>
                                      {/* Colored header */}
                                      <div className="px-3 py-1.5 text-center text-[11px] font-semibold text-white" style={{ background: headerColor }}>
                                        {s.label}
                                      </div>
                                      {/* STD / US sub-header */}
                                      <div className="grid grid-cols-2 text-[10px] font-semibold uppercase tracking-wider" style={{ borderBottom: `1px solid ${BORDER}` }}>
                                        <div className="px-2 py-1 text-center" style={{ color: "#94a3b8", borderRight: `1px solid ${BORDER}` }}>STD</div>
                                        <div className="px-2 py-1 text-center" style={{ color: "#94a3b8" }}>US</div>
                                      </div>
                                      {/* % row */}
                                      <div className="grid grid-cols-2 text-[12px] tabular-nums font-semibold">
                                        <div className="px-2 py-1.5 text-center" style={{ color: "#cbd5e1", borderRight: `1px solid ${BORDER}` }}>
                                          {s.industry.toFixed(2)}%
                                        </div>
                                        <div className="px-2 py-1.5 text-center" style={{ color: ahead ? SAGE : ROSE }}>
                                          {s.ours.toFixed(2)}%
                                        </div>
                                      </div>
                                      {/* Count row */}
                                      <div className="grid grid-cols-2 text-[12px] tabular-nums" style={{ borderTop: `1px solid ${BORDER}` }}>
                                        <div className="px-2 py-1.5 text-center" style={{ color: "#cbd5e1", borderRight: `1px solid ${BORDER}` }}>
                                          {s.industryExpectedCount.toLocaleString("en-IN")}
                                        </div>
                                        <div className="px-2 py-1.5 text-center font-semibold" style={{ color: ahead ? SAGE : ROSE }}>
                                          {s.count.toLocaleString("en-IN")}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Legend */}
                              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px]" style={{ color: MUTED }}>
                                <span><strong style={{ color: "#cbd5e1" }}>STD</strong> = Indian e-commerce standard</span>
                                <span><strong style={{ color: INK }}>US</strong> = our actual</span>
                                <span><span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: SAGE }} /> at or above standard</span>
                                <span><span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: ROSE }} /> below standard</span>
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
                        if (isVideo) {
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
                {normalizeFormat(selected.creativeType) === "video" && (
                  <>
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
                  </>
                )}
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
