"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Calendar,
  IndianRupee,
  ShoppingBag,
  Ban,
  PackageX,
  Gauge,
  Users,
} from "lucide-react";
import type {
  SalesMetrics,
  BuyerSplit,
  DailyBreakdownPoint,
  ProductDailyPoint,
  PaymentDailyPoint,
} from "@/lib/sales-aggregations";

type PeriodData = SalesMetrics & {
  from: string;
  to: string;
  dailyBreakdown: DailyBreakdownPoint[];
  productDaily: ProductDailyPoint[];
  paymentDaily: PaymentDailyPoint[];
};

const SERIES_PALETTE = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#10b981", // emerald
  "#f59e0b", // amber
  "#0ea5e9", // sky
  "#8b5cf6", // violet
];

type MetricKey =
  | "sales"
  | "confirmedOrders"
  | "cancelled"
  | "rto"
  | "aov"
  | "uniqueCustomers";

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateStr(s: string): Date | null {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatCurrency(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
}

const PRESETS: { label: string; days: number }[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 365 days", days: 365 },
];

// Three shared colors for every chart — consistent across all metrics.
const LINE_COLORS = {
  total: "#0f172a", // slate-900 — the headline
  new: "#8b5cf6", // violet-500 — new users
  repeat: "#10b981", // emerald-500 — repeat
};

const TONE_MAP = {
  emerald: { accent: "from-emerald-600 to-teal-600", icon: "bg-emerald-50 text-emerald-600" },
  sky: { accent: "from-sky-600 to-indigo-600", icon: "bg-sky-50 text-sky-600" },
  rose: { accent: "from-rose-600 to-pink-600", icon: "bg-rose-50 text-rose-600" },
  amber: { accent: "from-amber-600 to-orange-600", icon: "bg-amber-50 text-amber-600" },
  indigo: { accent: "from-indigo-600 to-violet-600", icon: "bg-indigo-50 text-indigo-600" },
  violet: { accent: "from-violet-600 to-fuchsia-600", icon: "bg-violet-50 text-violet-600" },
} as const;

type Tone = keyof typeof TONE_MAP;

type MetricRowConfig = {
  key: MetricKey;
  label: string;
  tagline: string;
  icon: React.ReactNode;
  tone: Tone;
  fmt: (n: number) => string;
};

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function SplitBar({ split }: { split: BuyerSplit }) {
  const ftPct = pct(split.firstTime, split.total);
  const rpPct = 100 - ftPct;
  if (split.total <= 0) return <div className="h-1.5 w-full rounded-full bg-neutral-100" />;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div
        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
        style={{ width: `${ftPct}%` }}
      />
      <div
        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
        style={{ width: `${rpPct}%` }}
      />
    </div>
  );
}

function MetricCard({
  cfg,
  split,
}: {
  cfg: MetricRowConfig;
  split: BuyerSplit;
}) {
  const tone = TONE_MAP[cfg.tone];
  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-neutral-50 to-transparent opacity-40 blur-2xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-neutral-500">{cfg.label}</p>
            <p className="mt-0.5 text-[10px] italic text-neutral-400">{cfg.tagline}</p>
          </div>
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone.icon}`}>
            {cfg.icon}
          </span>
        </div>
        <div className="mt-3 rounded-xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white px-4 py-3 shadow-inner">
          <p
            className={`bg-gradient-to-r ${tone.accent} bg-clip-text text-3xl font-bold tabular-nums text-transparent`}
          >
            {cfg.fmt(split.total)}
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="font-bold tabular-nums text-violet-700">{cfg.fmt(split.firstTime)}</span>
              <span className="text-neutral-600">new users</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-neutral-600">repeat</span>
              <span className="font-bold tabular-nums text-emerald-700">{cfg.fmt(split.repeat)}</span>
            </span>
          </div>
        </div>
        <div className="mt-3">
          <SplitBar split={split} />
        </div>
      </div>
    </div>
  );
}

function TrendChart({
  data,
  isCurrency,
}: {
  data: { date: string; total: number; new: number; repeat: number }[];
  isCurrency: boolean;
}) {
  const chartData = data.map((d) => ({
    ...d,
    newPct: d.total > 0 ? Math.round((d.new / d.total) * 1000) / 10 : 0,
    repeatPct: d.total > 0 ? Math.round((d.repeat / d.total) * 1000) / 10 : 0,
  }));

  return (
    <div className="h-full min-h-[260px] rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 40, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (isCurrency ? formatCurrency(v) : String(v))}
              allowDecimals={false}
              width={56}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
              width={40}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value, name) => {
                const n = Number(value);
                if (name === "newPct") return [`${n}%`, "New %"];
                if (name === "repeatPct") return [`${n}%`, "Repeat %"];
                const label = name === "total" ? "Total" : name === "new" ? "New users" : "Repeat";
                return [isCurrency ? `₹${n.toLocaleString()}` : n, label];
              }}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            {/* Absolute value lines */}
            <Line yAxisId="left" type="monotone" dataKey="total" stroke={LINE_COLORS.total} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            <Line yAxisId="left" type="monotone" dataKey="new" stroke={LINE_COLORS.new} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line yAxisId="left" type="monotone" dataKey="repeat" stroke={LINE_COLORS.repeat} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            {/* Percentage lines — dashed */}
            <Line yAxisId="right" type="monotone" dataKey="newPct" stroke={LINE_COLORS.new} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="repeatPct" stroke={LINE_COLORS.repeat} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-center gap-5 text-xs">
        <LegendDot color={LINE_COLORS.total} label="Total" />
        <LegendDot color={LINE_COLORS.new} label="New users" />
        <LegendDot color={LINE_COLORS.repeat} label="Repeat" />
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "#9ca3af" }} />
          <span className="font-medium">% lines</span>
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-neutral-600">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="font-medium">{label}</span>
    </span>
  );
}

export function SalesTrending() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [range, setRange] = useState<DateRange | undefined>();
  const [showPicker, setShowPicker] = useState(false);
  const [data, setData] = useState<PeriodData | null>(null);
  const [loading, setLoading] = useState(false);

  const pushUrl = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    router.replace(`/dashboard/sales/trending${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const fetchPeriod = async (from: Date, to: Date) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/period?from=${formatDate(from)}&to=${formatDate(to)}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    if (fromParam && toParam) {
      const from = parseDateStr(fromParam);
      const to = parseDateStr(toParam);
      if (from && to) {
        setRange({ from, to });
        fetchPeriod(from, to);
        return;
      }
    }
    applyPreset(7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days + 1);
    setRange({ from, to });
    setShowPicker(false);
    fetchPeriod(from, to);
    pushUrl({ from: formatDate(from), to: formatDate(to) });
  };

  const applyRange = () => {
    if (range?.from && range?.to) {
      setShowPicker(false);
      fetchPeriod(range.from, range.to);
      pushUrl({ from: formatDate(range.from), to: formatDate(range.to) });
    }
  };

  const fmtNum = (n: number) => n.toLocaleString();
  const fmtMoney = (n: number) => formatCurrency(n);

  const rows: MetricRowConfig[] = [
    { key: "sales", label: "Sales", tagline: "the cash that came in", icon: <IndianRupee size={18} />, tone: "emerald", fmt: fmtMoney },
    { key: "uniqueCustomers", label: "Unique Customers", tagline: "real humans, not bots", icon: <Users size={18} />, tone: "violet", fmt: fmtNum },
    { key: "aov", label: "AOV", tagline: "avg order value per day", icon: <Gauge size={18} />, tone: "indigo", fmt: fmtMoney },
    { key: "confirmedOrders", label: "Confirmed Orders", tagline: "sealed and delivered", icon: <ShoppingBag size={18} />, tone: "sky", fmt: fmtNum },
    { key: "cancelled", label: "Cancelled Orders", tagline: "changed their minds", icon: <Ban size={18} />, tone: "rose", fmt: fmtNum },
    { key: "rto", label: "RTO", tagline: "sent it, got it back", icon: <PackageX size={18} />, tone: "amber", fmt: fmtNum },
  ];

  const splitFromSummary = (key: MetricKey, m: SalesMetrics): BuyerSplit => {
    const s = m.summaryTable.overallSale;
    if (key === "sales") return s.sales;
    if (key === "confirmedOrders") return s.confirmedOrders;
    if (key === "cancelled") return s.cancelledOrders;
    if (key === "rto") return s.rto;
    if (key === "aov") return s.aov;
    return s.uniqueCustomers;
  };

  const seriesFromDaily = (key: MetricKey, daily: DailyBreakdownPoint[]) =>
    daily.map((d) => {
      const b = key === "cancelled" ? d.cancelled : d[key];
      return { date: d.date, total: b.total, new: b.new, repeat: b.repeat };
    });

  return (
    <div className="space-y-6">
      {/* Picker row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
          >
            <Calendar size={16} className="text-rose-500" />
            {range?.from && range?.to
              ? `${range.from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} — ${range.to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
              : "Select date range"}
          </button>

          {showPicker && (
            <div className="absolute z-50 mt-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl">
              <DayPicker
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={2}
                endMonth={new Date()}
                startMonth={new Date(2022, 0)}
                captionLayout="dropdown"
              />
              <div className="flex justify-end gap-2 px-3 pb-2">
                <button
                  onClick={() => setShowPicker(false)}
                  className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  onClick={applyRange}
                  disabled={!range?.from || !range?.to}
                  className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.days)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600 transition-colors hover:border-rose-200 hover:bg-rose-50/40 hover:text-rose-700"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Global legend — one place to learn the code */}
      {data && data.dailyBreakdown?.length > 0 && (
        <div className="flex flex-wrap items-center gap-5 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-xs uppercase tracking-wider text-neutral-500">Line guide</span>
          <LegendDot color={LINE_COLORS.total} label="Total" />
          <LegendDot color={LINE_COLORS.new} label="New users" />
          <LegendDot color={LINE_COLORS.repeat} label="Repeat" />
          <span className="ml-auto text-xs italic text-neutral-400">
            Same color code used across every chart below.
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        </div>
      )}

      {/* Empty */}
      {!loading && !data && (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm text-neutral-400">Pick a date range or preset to see the trend.</p>
        </div>
      )}

      {/* No data */}
      {!loading && data && data.totalOrders === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-sm text-neutral-500">No orders found in this period.</p>
        </div>
      )}

      {/* Rows — one per metric */}
      {!loading && data && data.totalOrders > 0 && data.dailyBreakdown?.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-neutral-900">Overall Sale Trends</h2>
          {rows.map((cfg) => {
            const split = splitFromSummary(cfg.key, data);
            const series = seriesFromDaily(cfg.key, data.dailyBreakdown);
            const isCurrency = cfg.key === "sales" || cfg.key === "aov";
            return (
              <div key={cfg.key} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
                <MetricCard cfg={cfg} split={split} />
                <TrendChart data={series} isCurrency={isCurrency} />
              </div>
            );
          })}

          {/* Product Sale — time-series per top product */}
          <ProductTrend metrics={data} />

          {/* Payment — revenue per method over time */}
          <PaymentTrend metrics={data} />

          {/* Discount codes — not in data yet */}
          <DiscountCodesPlaceholder />
        </div>
      )}
    </div>
  );
}

function shortName(s: string, n = 22) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/* ─────── Multi-series time chart (one line per product / method) ─────── */
function MultiSeriesChart({
  data,
  keys,
  isCurrency,
}: {
  data: Record<string, number | string>[];
  keys: string[];
  isCurrency: boolean;
}) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => (isCurrency ? formatCurrency(v) : String(v))}
            allowDecimals={false}
            width={56}
          />
          <Tooltip
            formatter={(value, name) => {
              const n = Number(value);
              return [isCurrency ? `₹${n.toLocaleString()}` : n, String(name)];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          {keys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={SERIES_PALETTE[i % SERIES_PALETTE.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function pivotDaily<T extends { date: string }>(
  rows: T[],
  keyField: keyof T,
  valueField: keyof T,
  topKeys: string[],
): Record<string, number | string>[] {
  const allow = new Set(topKeys);
  const byDate = new Map<string, Record<string, number | string>>();
  const dates = new Set<string>();
  for (const r of rows) {
    dates.add(r.date);
    const key = String(r[keyField]);
    if (!allow.has(key)) continue;
    const row = byDate.get(r.date) || { date: r.date };
    row[key] = (Number(row[key]) || 0) + Number(r[valueField]);
    byDate.set(r.date, row);
  }
  // Ensure every date exists (even if a top key had 0 that day) for a stable x-axis
  for (const d of dates) {
    if (!byDate.has(d)) byDate.set(d, { date: d });
    const row = byDate.get(d)!;
    for (const k of topKeys) if (row[k] == null) row[k] = 0;
  }
  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

/* ─────── Stacked area chart: new + repeat stacked up to total ─────── */
function StackedAreaChart({
  data,
}: {
  data: { date: string; new: number; repeat: number }[];
}) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
          <Tooltip
            formatter={(value, name) => {
              const label = name === "new" ? "New users" : "Repeat";
              return [Number(value), label];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Area
            type="monotone"
            dataKey="new"
            stackId="1"
            stroke={LINE_COLORS.new}
            fill={LINE_COLORS.new}
            fillOpacity={0.35}
          />
          <Area
            type="monotone"
            dataKey="repeat"
            stackId="1"
            stroke={LINE_COLORS.repeat}
            fill={LINE_COLORS.repeat}
            fillOpacity={0.35}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-center gap-5 text-xs">
        <LegendDot color={LINE_COLORS.new} label="New users" />
        <LegendDot color={LINE_COLORS.repeat} label="Repeat" />
      </div>
    </div>
  );
}

/* ─────── Product Sale — one stacked-area chart per top product ─────── */
function ProductTrend({ metrics }: { metrics: PeriodData }) {
  const top = metrics.summaryTable.productSale.slice(0, 5);
  if (top.length === 0 || metrics.productDaily.length === 0) return null;

  const allDates = Array.from(new Set(metrics.productDaily.map((r) => r.date))).sort();

  const seriesFor = (product: string) => {
    const byDate = new Map<string, { new: number; repeat: number }>();
    for (const r of metrics.productDaily) {
      if (r.product !== product) continue;
      byDate.set(r.date, { new: r.new, repeat: r.repeat });
    }
    return allDates.map((d) => ({
      date: d,
      new: byDate.get(d)?.new ?? 0,
      repeat: byDate.get(d)?.repeat ?? 0,
    }));
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">Product Sale — Composition Over Time</h2>
        <p className="text-xs italic text-neutral-400">
          Top 5 products. Each chart stacks new users + repeat = total orders per day.
        </p>
      </div>
      {top.map((p) => {
        const split: BuyerSplit = { total: p.total, firstTime: p.firstTime, repeat: p.repeat };
        const cfg: MetricRowConfig = {
          key: "confirmedOrders",
          label: shortName(p.product, 28),
          tagline: "units ordered over the period",
          icon: <ShoppingBag size={18} />,
          tone: "indigo",
          fmt: (n: number) => n.toLocaleString(),
        };
        return (
          <div key={p.product} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
            <MetricCard cfg={cfg} split={split} />
            <div className="h-full min-h-[260px] rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <StackedAreaChart data={seriesFor(p.product)} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ─────── Payment time-series: revenue per method per day ─────── */
function PaymentTrend({ metrics }: { metrics: PeriodData }) {
  const topMethods = metrics.summaryTable.payment.slice(0, 5).map((p) => p.method);
  if (topMethods.length === 0 || metrics.paymentDaily.length === 0) return null;

  const revByMethod = new Map<string, number>();
  for (const r of metrics.paymentDaily) {
    if (!topMethods.includes(r.method)) continue;
    revByMethod.set(r.method, (revByMethod.get(r.method) || 0) + r.total);
  }

  const chartData = pivotDaily(metrics.paymentDaily, "method", "total", topMethods);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-neutral-900">Payment — Revenue by Method Over Time</h2>
      <p className="text-xs italic text-neutral-400">
        Top 5 payment methods by revenue. Each line = daily revenue through that method.
      </p>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <MultiSeriesChart data={chartData} keys={topMethods} isCurrency={true} />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
          {topMethods.map((m, i) => (
            <span key={m} className="flex items-center gap-1.5 text-neutral-700">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: SERIES_PALETTE[i % SERIES_PALETTE.length] }}
              />
              <span className="font-medium">{shortName(m)}</span>
              <span className="tabular-nums text-neutral-400">
                ({formatCurrency(revByMethod.get(m) || 0)})
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────── Discount codes placeholder (not in data yet) ─────── */
function DiscountCodesPlaceholder() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-neutral-900">Discount Codes</h2>
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-6 text-sm text-amber-900">
        <p className="font-medium">No discount data yet.</p>
        <p className="mt-1 text-amber-800/80">
          Your order import (CSV + <code className="rounded bg-white px-1.5 py-0.5 text-amber-700">SalesOrder</code> schema) doesn&apos;t carry a discount-code column.
          Add a <code className="rounded bg-white px-1.5 py-0.5 text-amber-700">discountCode</code> field to the import and this panel will light up with code-by-code trends.
        </p>
      </div>
    </section>
  );
}
