"use client";

import { useEffect, useMemo, useState } from "react";
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
  purchases: number;
  purchaseValue: number;
  frequency: number;
  hookRate: number;
  holdRate: number;
};

type Ad = {
  adId: number;
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
}) {
  const series = data.map((d) => d.value);
  const delta = deltaPct(series);
  const arrowColor = delta > 0 ? SAGE : delta < 0 ? ROSE : MUTED;
  const ArrowIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : null;

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
      <div className="flex items-baseline justify-between gap-2 mb-2">
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/meta/ads?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        if (cancelled) return;
        setData(d);
        if (d.ads && d.ads.length > 0) {
          setSelectedId((cur) => (cur && d.ads.some((a) => a.adId === cur) ? cur : d.ads[0].adId));
        } else {
          setSelectedId(null);
        }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

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
            <span className="font-bold" style={{ color: INK }}>{data.totals.adsCount}</span> ads with spend
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

      {/* Total spend strip */}
      <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Total spend</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{formatInr(totalSpend)}</p>
          </div>
          <span className="text-xs italic" style={{ color: MUTED }}>across all ads in window</span>
        </div>
        {data.totalDailySpend.length > 0 ? (
          <ResponsiveContainer width="100%" height={70}>
            <AreaChart
              data={data.totalDailySpend.map((d) => ({ label: d.date.slice(5), value: d.spend }))}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="totalspend-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ROSE} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={ROSE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(v: any) => [formatInr(Number(v)), "Spend"]}
                contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${CREAM}` }}
              />
              <Area type="monotone" dataKey="value" stroke={ROSE} strokeWidth={2} fill="url(#totalspend-grad)" dot={{ r: 2, fill: ROSE }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs italic py-4 text-center" style={{ color: MUTED }}>No spend in this window.</p>
        )}
      </div>

      {/* Ads table */}
      <section className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: "white", borderColor: BORDER }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: BORDER }}>
          <h2 className="text-lg font-semibold" style={{ color: INK }}>Ads with spend</h2>
          <p className="text-xs italic mt-1" style={{ color: MUTED }}>
            Sorted by spend (highest first). Click any row to drill in below. Sparkline = daily spend trend.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: CREAM_BG }}>
                {[
                  { label: "Ad", align: "left" },
                  { label: "Status", align: "left" },
                  { label: "Spend", align: "right" },
                  { label: "Trend", align: "left" },
                  { label: "ROAS", align: "right" },
                  { label: "Purchases", align: "right" },
                  { label: "Frequency", align: "right" },
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
              {data.ads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-sm italic" style={{ color: MUTED }}>
                    No ad spend in this window. Try a wider date range.
                  </td>
                </tr>
              )}
              {data.ads.map((ad) => {
                const isSelected = ad.adId === selectedId;
                const roasColor = ad.roas >= 2 ? SAGE : ad.roas >= 1 ? AMBER : ROSE;
                const freqColor = ad.avgFrequency > 3 ? ROSE : ad.avgFrequency > 2 ? AMBER : INK;
                return (
                  <tr
                    key={ad.adId}
                    onClick={() => setSelectedId(ad.adId)}
                    className="border-t cursor-pointer transition-colors"
                    style={{
                      borderColor: CREAM,
                      background: isSelected ? `${AMBER}10` : "white",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = CREAM_BG; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "white"; }}
                  >
                    <td className="px-3 py-3" style={{ color: INK }}>
                      <div className="flex items-center gap-2.5">
                        {ad.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ad.thumbnailUrl}
                            alt=""
                            className="h-9 w-9 rounded-lg object-cover flex-shrink-0"
                            style={{ background: CREAM }}
                          />
                        ) : (
                          <div
                            className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-white text-sm"
                            style={{
                              background: `linear-gradient(135deg, ${thumbColor(ad.name)}, ${thumbColor(ad.name)}cc)`,
                            }}
                          >
                            {thumbInitial(ad.name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate max-w-xs" title={ad.name}>{ad.name}</p>
                          <p className="text-[10px] truncate" style={{ color: MUTED }} title={`${ad.campaignName} → ${ad.adSetName}`}>
                            {ad.campaignName} · {ad.adSetName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{
                          background: ad.status === "ACTIVE" ? `${SAGE}22` : `${MUTED}22`,
                          color: ad.status === "ACTIVE" ? SAGE : MUTED,
                        }}
                      >
                        {ad.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold" style={{ color: INK }}>{formatInr(ad.spend)}</td>
                    <td className="px-3 py-3"><MiniSparkline data={ad.daily.map((d) => d.spend)} color={ROSE} /></td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold" style={{ color: roasColor }}>
                      {ad.roas.toFixed(2)}x
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: INK }}>{ad.purchases}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: freqColor }}>
                      {ad.avgFrequency.toFixed(1)}x
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Drill-down */}
      {selected && (
        <section className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: "white", borderColor: BORDER }}>
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
                {data.ads.map((a) => (
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

                {/* Window totals strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Spend</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{formatInr(selected.spend)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>ROAS</p>
                    <p
                      className="text-2xl font-bold tabular-nums"
                      style={{ color: selected.roas >= 2 ? SAGE : selected.roas >= 1 ? AMBER : ROSE }}
                    >
                      {selected.roas.toFixed(2)}x
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Purchases</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{selected.purchases}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>CPA</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>
                      {selected.purchases > 0 ? formatInr(selected.cpa) : "—"}
                    </p>
                  </div>
                </div>

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
                />
                <ChartCard
                  title="Hook rate"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.hookRate }))}
                  formatY={(v) => `${v.toFixed(0)}%`}
                  chartType="area"
                  color={TEAL}
                />
                <ChartCard
                  title="Hold rate"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.holdRate }))}
                  formatY={(v) => `${v.toFixed(0)}%`}
                  chartType="area"
                  color={SAGE}
                />
                <ChartCard
                  title="Frequency"
                  data={selected.daily.map((d) => ({ date: d.date, value: d.frequency }))}
                  formatY={(v) => `${v.toFixed(1)}x`}
                  chartType="line"
                  color={INK}
                  warnZone={{ from: 3, color: ROSE }}
                  thresholdLabel="fatigue"
                />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
