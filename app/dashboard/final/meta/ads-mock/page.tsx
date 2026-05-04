"use client";

import { useMemo, useState } from "react";
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
  Eye,
  Sparkles,
  TrendingUp,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// Color palette — matches the rest of the dashboard
// ─────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────
// Mock data — 6 ads with varied profiles
// ─────────────────────────────────────────────────────────────────
type DailyMetric = {
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
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED";
  campaign: string;
  adSet: string;
  thumbColor: string;
  thumbInitial: string;
  creativeType: "video" | "image" | "carousel";
  daysRunning: number;
  qualityRanking: "Above avg" | "Average" | "Below avg" | null;
  daily: DailyMetric[];
};

const DATES_LAST_7 = [
  "2026-04-27",
  "2026-04-28",
  "2026-04-29",
  "2026-04-30",
  "2026-05-01",
  "2026-05-02",
  "2026-05-03",
];

function buildDaily(profile: number[]): DailyMetric[] {
  // profile = [spendBase, ctrBase, roasBase, freqBase, hookBase, holdBase]
  const [spendBase, ctrBase, roasBase, freqBase, hookBase, holdBase] = profile;
  return DATES_LAST_7.map((date, i) => {
    const t = i / 6; // 0..1 across the window
    const wobble = (Math.sin(i * 1.7) + 1) * 0.15;
    const spend = spendBase * (0.7 + 0.6 * t) * (1 + wobble);
    const impressions = Math.round(spend / 4);
    const reach = Math.round(impressions * 0.55);
    const ctr = ctrBase * (1 - 0.2 * t + wobble * 0.3);
    const clicks = Math.round(impressions * (ctr / 100));
    const roas = roasBase * (1 - 0.1 * t + wobble * 0.2);
    const purchaseValue = spend * roas;
    const purchases = Math.max(0, Math.round(purchaseValue / 850));
    return {
      date,
      spend: Math.round(spend),
      impressions,
      reach,
      clicks,
      purchases,
      purchaseValue: Math.round(purchaseValue),
      frequency: +(freqBase + 0.4 * t + wobble * 0.3).toFixed(2),
      hookRate: +(hookBase * (1 + wobble * 0.5)).toFixed(2),
      holdRate: +(holdBase * (1 + wobble * 0.3)).toFixed(2),
    };
  });
}

const ADS: Ad[] = [
  {
    id: "ad1",
    name: "Berry Cola — Hook video v3 (top performer)",
    status: "ACTIVE",
    campaign: "Spring Sale 2026",
    adSet: "Lookalike India 25-45",
    thumbColor: ROSE,
    thumbInitial: "B",
    creativeType: "video",
    daysRunning: 12,
    qualityRanking: "Above avg",
    // [spend, ctr, roas, freq, hookRate, holdRate]
    daily: buildDaily([2200, 2.4, 2.5, 1.6, 14, 38]),
  },
  {
    id: "ad2",
    name: "Lifestyle reel — Berry Cola couple",
    status: "ACTIVE",
    campaign: "Spring Sale 2026",
    adSet: "Interest: Fitness 18-35",
    thumbColor: AMBER,
    thumbInitial: "L",
    creativeType: "video",
    daysRunning: 7,
    qualityRanking: "Average",
    daily: buildDaily([1300, 1.6, 1.4, 2.0, 9, 28]),
  },
  {
    id: "ad3",
    name: "Carousel — All flavours range",
    status: "PAUSED",
    campaign: "Awareness Q2",
    adSet: "Broad India 18-55",
    thumbColor: VIOLET,
    thumbInitial: "C",
    creativeType: "carousel",
    daysRunning: 21,
    qualityRanking: "Below avg",
    daily: buildDaily([900, 0.8, 0.4, 4.2, 4, 0]),
  },
  {
    id: "ad4",
    name: "Static image — Mojito flavour drop",
    status: "ACTIVE",
    campaign: "Mojito Launch",
    adSet: "Lookalike Mojito buyers",
    thumbColor: TEAL,
    thumbInitial: "M",
    creativeType: "image",
    daysRunning: 5,
    qualityRanking: "Average",
    daily: buildDaily([700, 1.4, 1.1, 1.4, 0, 0]),
  },
  {
    id: "ad5",
    name: "UGC testimonial reel — fitness influencer",
    status: "ACTIVE",
    campaign: "UGC Test",
    adSet: "Interest: Wellness 25-40",
    thumbColor: SAGE,
    thumbInitial: "U",
    creativeType: "video",
    daysRunning: 4,
    qualityRanking: "Above avg",
    daily: buildDaily([500, 2.1, 2.8, 1.2, 18, 42]),
  },
  {
    id: "ad6",
    name: "Carousel — Festive gift box",
    status: "PAUSED",
    campaign: "Gift Box Q2",
    adSet: "Lookalike Premium 30-50",
    thumbColor: "#cc7a3f",
    thumbInitial: "G",
    creativeType: "carousel",
    daysRunning: 14,
    qualityRanking: null,
    daily: buildDaily([600, 1.0, 0.7, 3.6, 6, 0]),
  },
];

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function formatInr(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}
function formatNumber(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString("en-IN");
}
function sumWindow(ad: Ad) {
  const t = ad.daily.reduce(
    (a, d) => ({
      spend: a.spend + d.spend,
      impressions: a.impressions + d.impressions,
      reach: a.reach + d.reach,
      clicks: a.clicks + d.clicks,
      purchases: a.purchases + d.purchases,
      purchaseValue: a.purchaseValue + d.purchaseValue,
      frequencySum: a.frequencySum + d.frequency,
      hookSum: a.hookSum + d.hookRate,
      holdSum: a.holdSum + d.holdRate,
    }),
    {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      purchases: 0,
      purchaseValue: 0,
      frequencySum: 0,
      hookSum: 0,
      holdSum: 0,
    }
  );
  const days = ad.daily.length;
  return {
    spend: t.spend,
    impressions: t.impressions,
    reach: t.reach,
    clicks: t.clicks,
    purchases: t.purchases,
    purchaseValue: t.purchaseValue,
    avgFrequency: t.frequencySum / days,
    avgHookRate: t.hookSum / days,
    avgHoldRate: t.holdSum / days,
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
    cpa: t.purchases > 0 ? t.spend / t.purchases : 0,
    roas: t.spend > 0 ? t.purchaseValue / t.spend : 0,
  };
}
function deltaPct(series: number[]): number {
  if (series.length < 2) return 0;
  const first = series.slice(0, Math.ceil(series.length / 2)).reduce((a, b) => a + b, 0);
  const last = series.slice(Math.ceil(series.length / 2)).reduce((a, b) => a + b, 0);
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

// ─────────────────────────────────────────────────────────────────
// Reusable: Mini Sparkline (for table rows)
// ─────────────────────────────────────────────────────────────────
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={80} height={24}>
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-${color})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────────
// Reusable: Chart Card (for the 8-chart grid)
// ─────────────────────────────────────────────────────────────────
type ChartType = "area" | "bar" | "line";
function ChartCard({
  title,
  data,
  dataKey,
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
  dataKey?: string;
  formatY?: (v: number) => string;
  formatTip?: (v: number) => string;
  chartType?: ChartType;
  color: string;
  threshold?: number;
  thresholdLabel?: string;
  warnZone?: { from: number; to?: number; color: string };
}) {
  const series = data.map((d) => d.value);
  const delta = deltaPct(series);
  const arrowColor = delta > 0 ? SAGE : delta < 0 ? ROSE : MUTED;
  const ArrowIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : null;

  const fmtY = formatY ?? ((v: number) => `${v}`);
  const fmtTip = formatTip ?? fmtY;
  const gradientId = `g-${title.replace(/\W/g, "")}`;

  const chartData = data.map((d) => ({
    label: d.date.slice(5), // MM-DD
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
      <span className="hidden">{dataKey}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────
export default function AdsMockPage() {
  const [from, setFrom] = useState("2026-04-27");
  const [to, setTo] = useState("2026-05-03");
  const [selectedId, setSelectedId] = useState<string>("ad1");

  // Filter ads — only those with spend in window (mock: all 6 have spend)
  const adsInWindow = useMemo(() => {
    return ADS.filter((a) => {
      const inWindow = a.daily.filter((d) => d.date >= from && d.date <= to);
      return inWindow.reduce((s, d) => s + d.spend, 0) > 0;
    });
  }, [from, to]);

  // For total spend strip at top
  const totalDailySpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const ad of adsInWindow) {
      for (const d of ad.daily) {
        if (d.date < from || d.date > to) continue;
        map.set(d.date, (map.get(d.date) ?? 0) + d.spend);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, value }));
  }, [adsInWindow, from, to]);

  const totalSpend = totalDailySpend.reduce((s, d) => s + d.value, 0);

  const selected = useMemo(
    () => adsInWindow.find((a) => a.id === selectedId) ?? adsInWindow[0],
    [adsInWindow, selectedId]
  );

  return (
    <div className="relative min-h-full" style={{ background: "#fdfaf4" }}>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div>
          <p className="text-xs uppercase tracking-[0.3em]" style={{ color: AMBER, fontFamily: "Georgia, serif" }}>
            Mock · Wireframe preview
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold" style={{ color: INK }}>
            Meta Ads
          </h1>
          <p className="mt-1 text-sm italic" style={{ color: MUTED }}>
            Creative leaderboard with daily breakdown — design playground.
          </p>
        </div>

        {/* Date filter */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
          <div className="flex items-center gap-2">
            <Calendar size={14} style={{ color: AMBER }} />
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>From</label>
            <input
              type="date"
              value={from}
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
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
            />
          </div>
          <span className="ml-auto text-xs" style={{ color: MUTED }}>
            <span className="font-bold" style={{ color: INK }}>{adsInWindow.length}</span> ads with spend in this period
          </span>
        </div>

        {/* Top spend strip */}
        <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Total spend</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{formatInr(totalSpend)}</p>
            </div>
            <span className="text-xs italic" style={{ color: MUTED }}>across all ads in window</span>
          </div>
          <ResponsiveContainer width="100%" height={70}>
            <AreaChart data={totalDailySpend.map((d) => ({ label: d.date.slice(5), value: d.value }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                    <th key={h.label} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: MUTED, textAlign: h.align as "left" | "right" }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {adsInWindow
                  .map((a) => ({ ad: a, t: sumWindow({ ...a, daily: a.daily.filter((d) => d.date >= from && d.date <= to) }) }))
                  .sort((a, b) => b.t.spend - a.t.spend)
                  .map(({ ad, t }) => {
                    const isSelected = ad.id === selectedId;
                    const roasColor = t.roas >= 2 ? SAGE : t.roas >= 1 ? AMBER : ROSE;
                    const freqColor = t.avgFrequency > 3 ? ROSE : t.avgFrequency > 2 ? AMBER : INK;
                    const dailyInWindow = ad.daily.filter((d) => d.date >= from && d.date <= to);
                    return (
                      <tr
                        key={ad.id}
                        onClick={() => setSelectedId(ad.id)}
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
                            <div
                              className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-white text-sm"
                              style={{ background: `linear-gradient(135deg, ${ad.thumbColor}, ${ad.thumbColor}cc)` }}
                            >
                              {ad.thumbInitial}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate max-w-xs" title={ad.name}>{ad.name}</p>
                              <p className="text-[10px] truncate" style={{ color: MUTED }}>
                                {ad.campaign} · {ad.adSet}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: ad.status === "ACTIVE" ? `${SAGE}22` : `${MUTED}22`, color: ad.status === "ACTIVE" ? SAGE : MUTED }}>
                            {ad.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold" style={{ color: INK }}>{formatInr(t.spend)}</td>
                        <td className="px-3 py-3"><MiniSparkline data={dailyInWindow.map((d) => d.spend)} color={ROSE} /></td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold" style={{ color: roasColor }}>{t.roas.toFixed(2)}x</td>
                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: INK }}>{t.purchases}</td>
                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: freqColor }}>{t.avgFrequency.toFixed(1)}x</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Drill-down */}
        {selected && (() => {
          const dailyInWindow = selected.daily.filter((d) => d.date >= from && d.date <= to);
          const totals = sumWindow({ ...selected, daily: dailyInWindow });
          const roasColor = totals.roas >= 2 ? SAGE : totals.roas >= 1 ? AMBER : ROSE;
          return (
            <section className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: "white", borderColor: BORDER }}>
              <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: BORDER }}>
                <h2 className="text-lg font-semibold" style={{ color: INK }}>Drill-down</h2>
                <span className="text-xs italic" style={{ color: MUTED }}>showing daily breakdown for selected ad</span>
                <div className="ml-auto flex items-center gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Ad</label>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400 max-w-xs"
                    style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
                  >
                    {adsInWindow.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-5 space-y-6">
                {/* Hero strip — thumbnail + meta + window totals */}
                <div className="flex flex-col sm:flex-row gap-5">
                  <div
                    className="rounded-2xl flex items-center justify-center text-white font-bold flex-shrink-0"
                    style={{
                      width: 180,
                      height: 220,
                      fontSize: 64,
                      background: `linear-gradient(135deg, ${selected.thumbColor}, ${selected.thumbColor}aa)`,
                    }}
                  >
                    {selected.thumbInitial}
                  </div>

                  <div className="flex-1 min-w-0 space-y-4">
                    <div>
                      <h3 className="text-xl font-bold" style={{ color: INK }}>{selected.name}</h3>
                      <p className="text-sm mt-1" style={{ color: MUTED }}>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase mr-2" style={{ background: selected.status === "ACTIVE" ? `${SAGE}22` : `${MUTED}22`, color: selected.status === "ACTIVE" ? SAGE : MUTED }}>
                          {selected.status}
                        </span>
                        {selected.campaign} · {selected.adSet} · {selected.daysRunning}d running
                      </p>
                    </div>

                    {/* Window totals strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Spend</p>
                        <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{formatInr(totals.spend)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>ROAS</p>
                        <p className="text-2xl font-bold tabular-nums" style={{ color: roasColor }}>{totals.roas.toFixed(2)}x</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Purchases</p>
                        <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{totals.purchases}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>CPA</p>
                        <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{totals.purchases > 0 ? formatInr(totals.cpa) : "—"}</p>
                      </div>
                    </div>

                    {/* Health badges */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {selected.qualityRanking && (
                        <span className="rounded-full px-2.5 py-1 font-semibold" style={{
                          background: selected.qualityRanking === "Above avg" ? `${SAGE}22` : selected.qualityRanking === "Below avg" ? `${ROSE}22` : `${MUTED}22`,
                          color: selected.qualityRanking === "Above avg" ? SAGE : selected.qualityRanking === "Below avg" ? ROSE : MUTED,
                        }}>
                          Quality: {selected.qualityRanking}
                        </span>
                      )}
                      {totals.avgFrequency > 3 && (
                        <span className="rounded-full px-2.5 py-1 font-semibold flex items-center gap-1" style={{ background: `${ROSE}22`, color: ROSE }}>
                          <Sparkles size={10} /> Fatigued (freq {totals.avgFrequency.toFixed(1)}×)
                        </span>
                      )}
                      {totals.roas >= 2 && (
                        <span className="rounded-full px-2.5 py-1 font-semibold flex items-center gap-1" style={{ background: `${SAGE}22`, color: SAGE }}>
                          <TrendingUp size={10} /> Top performer
                        </span>
                      )}
                      {totals.roas < 1 && totals.spend > 1000 && (
                        <span className="rounded-full px-2.5 py-1 font-semibold" style={{ background: `${ROSE}22`, color: ROSE }}>
                          ⚠ Killer — losing money
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* MONEY FLOW — row 1 */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Money flow</p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <ChartCard
                      title="Spend"
                      data={dailyInWindow.map((d) => ({ date: d.date, value: d.spend }))}
                      formatY={(v) => formatInr(v)}
                      chartType="bar"
                      color={ROSE}
                    />
                    <ChartCard
                      title="ROAS"
                      data={dailyInWindow.map((d) => ({ date: d.date, value: d.purchaseValue / Math.max(d.spend, 1) }))}
                      formatY={(v) => `${v.toFixed(1)}x`}
                      formatTip={(v) => `${v.toFixed(2)}x`}
                      chartType="area"
                      color={SAGE}
                      threshold={1}
                      thresholdLabel="break-even"
                    />
                    <ChartCard
                      title="Purchases"
                      data={dailyInWindow.map((d) => ({ date: d.date, value: d.purchases }))}
                      formatY={(v) => `${v}`}
                      chartType="bar"
                      color={VIOLET}
                    />
                    <ChartCard
                      title="CPA"
                      data={dailyInWindow.map((d) => ({ date: d.date, value: d.purchases > 0 ? d.spend / d.purchases : 0 }))}
                      formatY={(v) => formatInr(v)}
                      chartType="line"
                      color={AMBER}
                    />
                  </div>
                </div>

                {/* ENGAGEMENT — row 2 */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Engagement</p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <ChartCard
                      title="CTR"
                      data={dailyInWindow.map((d) => ({ date: d.date, value: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0 }))}
                      formatY={(v) => `${v.toFixed(1)}%`}
                      chartType="line"
                      color="#8b5cf6"
                    />
                    <ChartCard
                      title="Hook rate"
                      data={dailyInWindow.map((d) => ({ date: d.date, value: d.hookRate }))}
                      formatY={(v) => `${v.toFixed(0)}%`}
                      chartType="area"
                      color={TEAL}
                    />
                    <ChartCard
                      title="Hold rate"
                      data={dailyInWindow.map((d) => ({ date: d.date, value: d.holdRate }))}
                      formatY={(v) => `${v.toFixed(0)}%`}
                      chartType="area"
                      color={SAGE}
                    />
                    <ChartCard
                      title="Frequency"
                      data={dailyInWindow.map((d) => ({ date: d.date, value: d.frequency }))}
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
          );
        })()}

        {/* Footnote */}
        <div className="text-center text-xs italic pt-4" style={{ color: MUTED }}>
          <Eye size={11} className="inline mr-1 -mt-0.5" />
          This is a wireframe preview with mock data. No real ads or spend shown here.
        </div>
      </div>
    </div>
  );
}
