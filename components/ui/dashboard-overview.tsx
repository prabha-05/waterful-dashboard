"use client";

import { useEffect, useState, useCallback } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Minus,
  Plus,
  IndianRupee,
  ShoppingBag,
  Users,
  Gauge,
  Calendar,
  Ban,
  PackageX,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { SalesTrendingExtras } from "@/components/ui/sales-trending";

const INK = "#4a3a2e";
const ROSE = "#d97777";
const SAGE = "#7a9471";
const AMBER = "#c99954";
const NEW_COLOR = "#8b5cf6";
const REPEAT_COLOR = "#10b981";
const TOTAL_COLOR = "#0f172a";

type Period = {
  label: string;
  from: string;
  to: string;
  orders: number;
  revenue: number;
  customers: number;
  aov: number;
  ftCustomers: number;
  repeatCustomers: number;
  ftOrders: number;
  repeatOrders: number;
  ftRevenue: number;
  repeatRevenue: number;
  cancelledOrders: number;
  rtoOrders: number;
  ftCancelledOrders: number;
  repeatCancelledOrders: number;
  ftRtoOrders: number;
  repeatRtoOrders: number;
};

type OverviewData = {
  count: number;
  unit: string;
  periods: Period[];
  totals: { orders: number; revenue: number; customers: number; aov: number };
  previousTotals: {
    orders: number;
    revenue: number;
    customers: number;
    aov: number;
    ftAov: number;
    repeatAov: number;
    cancelledOrders: number;
    rtoOrders: number;
    ftCancelledOrders: number;
    repeatCancelledOrders: number;
    ftRtoOrders: number;
    repeatRtoOrders: number;
  };
  previousWindow: { from: string; to: string };
};

function formatCurrency(value: number) {
  if (value >= 10000000) return `\u20B9${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `\u20B9${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `\u20B9${(value / 1000).toFixed(1)}K`;
  return `\u20B9${value}`;
}

function formatDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const UNITS = ["day", "week", "month"] as const;
type Unit = (typeof UNITS)[number];
type ChartMode = "revenue" | "orders" | "customers" | "aov";

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function formatRange(fromStr: string, toStrExclusive: string) {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStrExclusive.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  // API "to" is exclusive — subtract one day for user-facing range
  const to = new Date(ty, tm - 1, td - 1);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const fromStrF = from.toLocaleDateString("en-IN", opts);
  const toStrF = to.toLocaleDateString("en-IN", { ...opts, year: "numeric" });
  return `${fromStrF} – ${toStrF}`;
}

/* ─── Delta pill (stock-ticker style) ─── */
function DeltaPill({
  current,
  previous,
  invertColor = false,
  currentRange,
  previousRange,
  formatValue,
}: {
  current: number;
  previous: number;
  invertColor?: boolean;
  currentRange?: string;
  previousRange?: string;
  formatValue?: (n: number) => string;
}) {
  const fmt = formatValue || ((n: number) => n.toLocaleString());
  if (previous <= 0) {
    const tip = previousRange
      ? `no comparable data for ${previousRange}`
      : "no comparable previous period";
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: "#f5efe3", color: "#9a8571" }}
        title={tip}
      >
        new
      </span>
    );
  }
  const deltaPct = ((current - previous) / previous) * 100;
  const up = deltaPct >= 0;
  const good = invertColor ? !up : up;
  const UP = "#059669";
  const DOWN = "#dc2626";
  const color = good ? UP : DOWN;
  const bg = good ? "#ecfdf5" : "#fef2f2";
  const tipLines = [
    currentRange ? `Now (${currentRange}): ${fmt(current)}` : `Now: ${fmt(current)}`,
    previousRange ? `Prev (${previousRange}): ${fmt(previous)}` : `Prev: ${fmt(previous)}`,
  ];
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
      style={{ background: bg, color }}
      title={tipLines.join("\n")}
    >
      {up ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />}
      {Math.abs(deltaPct).toFixed(1)}%
    </span>
  );
}

/* ─── KPI card with new/repeat split ─── */
function SplitKpi({
  label,
  total,
  previous,
  ftValue,
  repeatValue,
  fmt,
  icon,
  accent,
  currentRange,
  previousRange,
}: {
  label: string;
  total: number;
  previous: number;
  ftValue: number;
  repeatValue: number;
  fmt: (n: number) => string;
  icon: React.ReactNode;
  accent: string;
  currentRange?: string;
  previousRange?: string;
}) {
  const ftPct = pct(ftValue, total);
  const repeatPct = 100 - ftPct;
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-5 shadow-sm"
      style={{ background: "white", borderColor: "#e8dfd0" }}
      title={currentRange ? `Current window: ${currentRange}` : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "#9a8571" }}
        >
          {label}
        </p>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-3xl font-bold tabular-nums" style={{ color: INK }}>
          {fmt(total)}
        </p>
        <DeltaPill
          current={total}
          previous={previous}
          currentRange={currentRange}
          previousRange={previousRange}
          formatValue={fmt}
        />
      </div>
      {total > 0 && (
        <>
          <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full" style={{ width: `${ftPct}%`, background: NEW_COLOR }} />
            <div className="h-full" style={{ width: `${repeatPct}%`, background: REPEAT_COLOR }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 tabular-nums">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: NEW_COLOR }} />
              <span className="font-semibold" style={{ color: NEW_COLOR }}>{fmt(ftValue)}</span>
              <span style={{ color: "#9a8571" }}>new</span>
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <span style={{ color: "#9a8571" }}>repeat</span>
              <span className="font-semibold" style={{ color: REPEAT_COLOR }}>{fmt(repeatValue)}</span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: REPEAT_COLOR }} />
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── AOV card — same SplitKpi visual; bar reflects the order-share split
   (AOV itself isn't additive, but the bar still communicates which cohort
   drives most of the orders the AOV is averaged over). ─── */
function AovSplitKpi({
  total,
  previous,
  ftAov,
  repeatAov,
  ftOrders,
  repeatOrders,
  icon,
  accent,
  currentRange,
  previousRange,
}: {
  total: number;
  previous: number;
  ftAov: number;
  repeatAov: number;
  ftOrders: number;
  repeatOrders: number;
  icon: React.ReactNode;
  accent: string;
  currentRange?: string;
  previousRange?: string;
}) {
  const totalOrders = ftOrders + repeatOrders;
  const ftPct = pct(ftOrders, totalOrders);
  const repeatPct = 100 - ftPct;
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-5 shadow-sm"
      style={{ background: "white", borderColor: "#e8dfd0" }}
      title={currentRange ? `Current window: ${currentRange}` : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "#9a8571" }}
        >
          Avg Order Value
        </p>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-3xl font-bold tabular-nums" style={{ color: INK }}>
          {formatCurrency(total)}
        </p>
        <DeltaPill
          current={total}
          previous={previous}
          currentRange={currentRange}
          previousRange={previousRange}
          formatValue={formatCurrency}
        />
      </div>
      {totalOrders > 0 && (
        <>
          <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full" style={{ width: `${ftPct}%`, background: NEW_COLOR }} />
            <div className="h-full" style={{ width: `${repeatPct}%`, background: REPEAT_COLOR }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 tabular-nums">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: NEW_COLOR }} />
              <span className="font-semibold" style={{ color: NEW_COLOR }}>{formatCurrency(ftAov)}</span>
              <span style={{ color: "#9a8571" }}>new</span>
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <span style={{ color: "#9a8571" }}>repeat</span>
              <span className="font-semibold" style={{ color: REPEAT_COLOR }}>{formatCurrency(repeatAov)}</span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: REPEAT_COLOR }} />
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Order Health card (cancelled / RTO) ─── */
function HealthCard({
  label,
  tagline,
  value,
  previous,
  pctOfOrders,
  accent,
  icon,
  sparkData,
  sparkKey,
  currentRange,
  previousRange,
  ftValue,
  repeatValue,
}: {
  label: string;
  tagline: string;
  value: number;
  previous: number;
  pctOfOrders: number;
  accent: string;
  icon: React.ReactNode;
  sparkData: any[];
  sparkKey: string;
  currentRange?: string;
  previousRange?: string;
  ftValue: number;
  repeatValue: number;
}) {
  const ftPct = pct(ftValue, value);
  const repeatPct = 100 - ftPct;
  const cardTip = [
    currentRange && `Now (${currentRange}): ${value.toLocaleString()}`,
    previousRange && `Prev (${previousRange}): ${previous.toLocaleString()}`,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-5 shadow-sm"
      style={{ background: "white", borderColor: "#e8dfd0" }}
      title={cardTip || undefined}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-[0.08]"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "#9a8571" }}
          >
            {label}
          </p>
          <p className="mt-0.5 text-[10px] italic" style={{ color: "#b5a48e" }}>
            {tagline}
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            <p className="text-3xl font-bold tabular-nums" style={{ color: accent }}>
              {value.toLocaleString()}
            </p>
            <DeltaPill
              current={value}
              previous={previous}
              invertColor
              currentRange={currentRange}
              previousRange={previousRange}
            />
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
              style={{ background: `${accent}18`, color: accent }}
            >
              {pctOfOrders.toFixed(1)}% of orders
            </span>
          </div>
        </div>
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </span>
      </div>
      {value > 0 && (
        <>
          <div className="relative mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full" style={{ width: `${ftPct}%`, background: NEW_COLOR }} />
            <div className="h-full" style={{ width: `${repeatPct}%`, background: REPEAT_COLOR }} />
          </div>
          <div className="relative mt-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 tabular-nums">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: NEW_COLOR }} />
              <span className="font-semibold" style={{ color: NEW_COLOR }}>{ftValue.toLocaleString()}</span>
              <span style={{ color: "#9a8571" }}>new</span>
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <span style={{ color: "#9a8571" }}>repeat</span>
              <span className="font-semibold" style={{ color: REPEAT_COLOR }}>{repeatValue.toLocaleString()}</span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: REPEAT_COLOR }} />
            </span>
          </div>
        </>
      )}
      <div className="relative mt-3 h-12">
        <ResponsiveContainer width="100%" height={48}>
          <LineChart data={sparkData} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
            <Line
              type="monotone"
              dataKey={sparkKey}
              stroke={accent}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, mode }: any) {
  if (!active || !payload?.length) return null;
  const isCurrency = mode === "revenue" || mode === "aov";
  return (
    <div
      className="rounded-xl border p-3 shadow-lg text-xs"
      style={{ background: "white", borderColor: "#e8dfd0" }}
    >
      <p className="font-semibold mb-2" style={{ color: INK }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "#9a8571" }}>{p.name}:</span>
          <span className="font-bold" style={{ color: INK }}>
            {isCurrency ? formatCurrency(p.value) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DashboardOverview() {
  const [count, setCount] = useState(7);
  const [inputValue, setInputValue] = useState("7");
  const [unit, setUnit] = useState<Unit>("day");
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const [endDate, setEndDate] = useState<Date>(yesterday);
  const [showPicker, setShowPicker] = useState(false);
  const [data, setData] = useState<OverviewData | null>(null);
  const [salesData, setSalesData] = useState<any | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>("revenue");

  const fetchData = useCallback(async (c: number, u: string, end: Date) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/overview?count=${c}&unit=${u}&end=${formatDateParam(end)}`);
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(count, unit, endDate);
  }, [count, unit, endDate, fetchData]);

  // Fetch deep-dive trending data for the same window shown in the overview.
  useEffect(() => {
    if (!data || data.periods.length === 0) return;
    const fromStr = data.periods[0].from;
    // API `to` is exclusive; /api/sales/period expects inclusive end.
    const [ty, tm, td] = data.periods[data.periods.length - 1].to.split("-").map(Number);
    const lastDay = new Date(ty, tm - 1, td - 1);
    const toStr = formatDateParam(lastDay);
    let cancelled = false;
    setSalesLoading(true);
    fetch(`/api/sales/period?from=${fromStr}&to=${toStr}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setSalesData(json);
      })
      .catch(() => {
        if (!cancelled) setSalesData(null);
      })
      .finally(() => {
        if (!cancelled) setSalesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const pickEndDate = (date: Date | undefined) => {
    if (!date) return;
    setEndDate(date);
    setShowPicker(false);
  };

  const inc = () => { const v = Math.min(count + 1, 52); setCount(v); setInputValue(String(v)); };
  const dec = () => { const v = Math.max(count - 1, 1); setCount(v); setInputValue(String(v)); };

  const unitLabel = (u: Unit) => ({ day: "Days", week: "Weeks", month: "Months" }[u]);

  /* current & previous window range strings for tooltips */
  const currentRange = data && data.periods.length > 0
    ? formatRange(data.periods[0].from, data.periods[data.periods.length - 1].to)
    : undefined;
  const previousRange = data?.previousWindow
    ? formatRange(data.previousWindow.from, data.previousWindow.to)
    : undefined;

  /* aggregate ft/repeat splits + health metrics across all periods */
  const splits = data ? data.periods.reduce(
    (a, p) => ({
      ftRevenue: a.ftRevenue + p.ftRevenue,
      repeatRevenue: a.repeatRevenue + p.repeatRevenue,
      ftOrders: a.ftOrders + p.ftOrders,
      repeatOrders: a.repeatOrders + p.repeatOrders,
      ftCustomers: a.ftCustomers + p.ftCustomers,
      repeatCustomers: a.repeatCustomers + p.repeatCustomers,
      cancelledOrders: a.cancelledOrders + p.cancelledOrders,
      rtoOrders: a.rtoOrders + p.rtoOrders,
      ftCancelledOrders: a.ftCancelledOrders + p.ftCancelledOrders,
      repeatCancelledOrders: a.repeatCancelledOrders + p.repeatCancelledOrders,
      ftRtoOrders: a.ftRtoOrders + p.ftRtoOrders,
      repeatRtoOrders: a.repeatRtoOrders + p.repeatRtoOrders,
    }),
    {
      ftRevenue: 0,
      repeatRevenue: 0,
      ftOrders: 0,
      repeatOrders: 0,
      ftCustomers: 0,
      repeatCustomers: 0,
      cancelledOrders: 0,
      rtoOrders: 0,
      ftCancelledOrders: 0,
      repeatCancelledOrders: 0,
      ftRtoOrders: 0,
      repeatRtoOrders: 0,
    },
  ) : null;

  const ftAov = splits && splits.ftOrders > 0 ? Math.round(splits.ftRevenue / splits.ftOrders) : 0;
  const repeatAov = splits && splits.repeatOrders > 0 ? Math.round(splits.repeatRevenue / splits.repeatOrders) : 0;

  const modeConfig: Record<ChartMode, { label: string; keys: { total: string; ft: string; repeat: string }; isCurrency: boolean }> = {
    revenue: { label: "Revenue", keys: { total: "revenue", ft: "ftRevenue", repeat: "repeatRevenue" }, isCurrency: true },
    orders: { label: "Orders", keys: { total: "orders", ft: "ftOrders", repeat: "repeatOrders" }, isCurrency: false },
    customers: { label: "Customers", keys: { total: "customers", ft: "ftCustomers", repeat: "repeatCustomers" }, isCurrency: false },
    aov: { label: "AOV", keys: { total: "aov", ft: "ftAov", repeat: "repeatAov" }, isCurrency: true },
  };

  // Augment periods with ft/repeat AOV per bucket so the AOV chart can render
  // the same three-line Total / New / Repeat pattern as the other modes.
  const chartData = data
    ? data.periods.map((p) => ({
        ...p,
        ftAov: p.ftOrders > 0 ? Math.round(p.ftRevenue / p.ftOrders) : 0,
        repeatAov: p.repeatOrders > 0 ? Math.round(p.repeatRevenue / p.repeatOrders) : 0,
      }))
    : [];

  // Repeat-share trend (per period) for the currently selected metric.
  // Skipped for AOV since AOV is a ratio, not a pool that can be split.
  const repeatTrend = data && splits && chartMode !== "aov"
    ? data.periods.map((p) => {
        let total = 0, rep = 0;
        if (chartMode === "revenue") { total = p.revenue; rep = p.repeatRevenue; }
        else if (chartMode === "orders") { total = p.orders; rep = p.repeatOrders; }
        else { total = p.customers; rep = p.repeatCustomers; }
        return {
          label: p.label,
          pct: total > 0 ? Math.round((rep / total) * 1000) / 10 : 0,
        };
      })
    : [];
  const overallRepeatPct = data && splits && chartMode !== "aov"
    ? (() => {
        let total = 0, rep = 0;
        if (chartMode === "revenue") { total = data.totals.revenue; rep = splits.repeatRevenue; }
        else if (chartMode === "orders") { total = data.totals.orders; rep = splits.repeatOrders; }
        else { total = data.totals.customers; rep = splits.repeatCustomers; }
        return total > 0 ? Math.round((rep / total) * 1000) / 10 : 0;
      })()
    : 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div
          className="inline-flex items-center rounded-xl border overflow-hidden"
          style={{ borderColor: "#e8dfd0", background: "white" }}
        >
          <button onClick={dec} className="px-3 py-2.5 transition-colors hover:bg-neutral-50" style={{ color: INK }}>
            <Minus size={16} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ""))}
            onBlur={() => {
              const v = parseInt(inputValue);
              const clamped = Math.min(Math.max(isNaN(v) ? 1 : v, 1), 52);
              setCount(clamped);
              setInputValue(String(clamped));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = parseInt(inputValue);
                const clamped = Math.min(Math.max(isNaN(v) ? 1 : v, 1), 52);
                setCount(clamped);
                setInputValue(String(clamped));
              }
            }}
            className="w-14 py-2.5 text-sm font-bold tabular-nums text-center border-x outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            style={{ color: INK, borderColor: "#e8dfd0" }}
          />
          <button onClick={inc} className="px-3 py-2.5 transition-colors hover:bg-neutral-50" style={{ color: INK }}>
            <Plus size={16} />
          </button>
        </div>

        <div className="inline-flex rounded-xl border overflow-hidden" style={{ borderColor: "#e8dfd0" }}>
          {UNITS.map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className="px-4 py-2.5 text-sm font-medium transition-colors capitalize"
              style={{
                background: unit === u ? INK : "white",
                color: unit === u ? "white" : INK,
              }}
            >
              {u}
            </button>
          ))}
        </div>

        <div className="relative inline-block">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-white/80"
            style={{ background: "white", borderColor: "#e8dfd0", color: INK }}
          >
            <Calendar size={16} style={{ color: AMBER }} />
            {endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </button>

          {showPicker && (
            <div
              className="absolute z-50 mt-2 rounded-xl border p-3 shadow-xl"
              style={{ background: "white", borderColor: "#e8dfd0" }}
            >
              <DayPicker
                mode="single"
                selected={endDate}
                onSelect={pickEndDate}
                endMonth={new Date()}
                startMonth={new Date(2022, 0)}
                captionLayout="dropdown"
              />
              <button
                onClick={() => { setEndDate(new Date()); setShowPicker(false); }}
                className="mt-2 w-full rounded-lg px-4 py-2 text-xs font-medium text-white"
                style={{ background: SAGE }}
              >
                Reset to Today
              </button>
            </div>
          )}
        </div>

        <p className="text-sm" style={{ color: "#9a8571" }}>
          <span className="font-bold" style={{ color: INK }}>
            {count} {unitLabel(unit).toLowerCase()}
          </span>{" "}
          ending {endDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Line guide */}
      {data && splits && (
        <div
          className="flex flex-wrap items-center gap-5 rounded-xl border px-4 py-3 shadow-sm"
          style={{ background: "white", borderColor: "#e8dfd0" }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9a8571" }}>
            Line guide
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOTAL_COLOR }} />
            <span className="font-medium" style={{ color: INK }}>Total</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: NEW_COLOR }} />
            <span className="font-medium" style={{ color: INK }}>New users</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: REPEAT_COLOR }} />
            <span className="font-medium" style={{ color: INK }}>Repeat</span>
          </span>
          <span className="ml-auto text-xs italic" style={{ color: "#9a8571" }}>
            Same code across every chart.
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: `${AMBER} transparent ${AMBER} ${AMBER}` }}
          />
        </div>
      )}

      {!loading && data && splits && (
        <>
          {/* KPI cards with splits */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SplitKpi
              label="Total Revenue"
              total={data.totals.revenue}
              previous={data.previousTotals?.revenue ?? 0}
              ftValue={splits.ftRevenue}
              repeatValue={splits.repeatRevenue}
              fmt={formatCurrency}
              icon={<IndianRupee size={18} />}
              accent={AMBER}
              currentRange={currentRange}
              previousRange={previousRange}
            />
            <SplitKpi
              label="Total Orders"
              total={data.totals.orders}
              previous={data.previousTotals?.orders ?? 0}
              ftValue={splits.ftOrders}
              repeatValue={splits.repeatOrders}
              fmt={(n) => n.toLocaleString()}
              icon={<ShoppingBag size={18} />}
              accent={SAGE}
              currentRange={currentRange}
              previousRange={previousRange}
            />
            <SplitKpi
              label="Total Customers"
              total={data.totals.customers}
              previous={data.previousTotals?.customers ?? 0}
              ftValue={splits.ftCustomers}
              repeatValue={splits.repeatCustomers}
              fmt={(n) => n.toLocaleString()}
              icon={<Users size={18} />}
              accent={ROSE}
              currentRange={currentRange}
              previousRange={previousRange}
            />
            <AovSplitKpi
              total={data.totals.aov}
              previous={data.previousTotals?.aov ?? 0}
              ftAov={ftAov}
              repeatAov={repeatAov}
              ftOrders={splits.ftOrders}
              repeatOrders={splits.repeatOrders}
              icon={<Gauge size={18} />}
              accent={AMBER}
              currentRange={currentRange}
              previousRange={previousRange}
            />
          </div>

          {/* Period Breakdown table */}
          <div
            className="rounded-2xl border shadow-sm overflow-hidden"
            style={{ background: "white", borderColor: "#e8dfd0" }}
          >
            <div className="px-5 py-4 border-b" style={{ borderColor: "#e8dfd0" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9a8571" }}>
                Period Breakdown
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "#faf6ef" }}>
                    {["Period", "Revenue", "Orders", "Customers", "AOV", "FT", "Repeat"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: "#9a8571" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.periods.map((p, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "#f1e7d3" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: INK }}>{p.label}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{formatCurrency(p.revenue)}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{p.orders.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{p.customers.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{formatCurrency(p.aov)}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: NEW_COLOR }}>{p.ftCustomers.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: REPEAT_COLOR }}>{p.repeatCustomers.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart mode toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl border overflow-hidden" style={{ borderColor: "#e8dfd0" }}>
              {(["revenue", "orders", "customers", "aov"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className="px-4 py-2 text-sm font-medium transition-colors capitalize"
                  style={{
                    background: chartMode === m ? INK : "white",
                    color: chartMode === m ? "white" : INK,
                  }}
                >
                  {modeConfig[m].label}
                </button>
              ))}
            </div>
          </div>

          {/* Main line chart */}
          <div
            className="rounded-2xl border p-5 shadow-sm"
            style={{ background: "white", borderColor: "#e8dfd0" }}
          >
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8dfd0" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#4a3a2e", fontSize: 12, fontWeight: 500 }}
                  axisLine={{ stroke: "#e8dfd0" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: "#9a8571", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    modeConfig[chartMode].isCurrency ? formatCurrency(v) : v.toLocaleString()
                  }
                />
                <Tooltip content={<ChartTooltip mode={chartMode} />} />
                <Line
                  type="monotone"
                  dataKey={modeConfig[chartMode].keys.total}
                  name="Total"
                  stroke={TOTAL_COLOR}
                  strokeWidth={2.5}
                  dot={{ fill: TOTAL_COLOR, r: 3 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey={modeConfig[chartMode].keys.ft}
                  name="New users"
                  stroke={NEW_COLOR}
                  strokeWidth={2}
                  dot={{ fill: NEW_COLOR, r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey={modeConfig[chartMode].keys.repeat}
                  name="Repeat"
                  stroke={REPEAT_COLOR}
                  strokeWidth={2}
                  dot={{ fill: REPEAT_COLOR, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Repeat Share Trend — how much of this metric comes from repeat customers */}
          {chartMode !== "aov" && repeatTrend.length > 0 && (
            <div
              className="rounded-2xl border p-5 shadow-sm"
              style={{ background: "white", borderColor: "#e8dfd0" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "#9a8571" }}
                  >
                    Repeat Share Trend
                  </p>
                  <p className="mt-0.5 text-xs italic" style={{ color: "#b5a48e" }}>
                    % of {modeConfig[chartMode].label.toLowerCase()} coming from repeat customers
                  </p>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold tabular-nums" style={{ color: REPEAT_COLOR }}>
                    {overallRepeatPct}%
                  </p>
                  <span className="text-xs" style={{ color: "#9a8571" }}>overall</span>
                </div>
              </div>
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={repeatTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1e7d3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#4a3a2e", fontSize: 11, fontWeight: 500 }}
                      axisLine={{ stroke: "#e8dfd0" }}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fill: "#9a8571", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      width={40}
                    />
                    <Tooltip
                      formatter={(v: any) => [`${v}%`, "Repeat share"]}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid #e8dfd0",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pct"
                      name="Repeat %"
                      stroke={REPEAT_COLOR}
                      strokeWidth={2.5}
                      dot={{ fill: REPEAT_COLOR, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Order Health — only when in Orders mode */}
          {chartMode === "orders" && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "#9a8571" }}
                  >
                    Order Health
                  </p>
                  <p className="mt-0.5 text-xs italic" style={{ color: "#b5a48e" }}>
                    orders that didn&apos;t make it — cancelled or returned
                  </p>
                </div>
                <p className="text-[11px] tabular-nums" style={{ color: "#9a8571" }}>
                  {data.totals.orders.toLocaleString()} total orders in view
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <HealthCard
                  label="Cancelled Orders"
                  tagline="customers who changed their minds"
                  value={splits.cancelledOrders}
                  previous={data.previousTotals?.cancelledOrders ?? 0}
                  pctOfOrders={
                    data.totals.orders > 0
                      ? (splits.cancelledOrders / data.totals.orders) * 100
                      : 0
                  }
                  accent={ROSE}
                  icon={<Ban size={18} />}
                  sparkData={data.periods}
                  sparkKey="cancelledOrders"
                  currentRange={currentRange}
                  previousRange={previousRange}
                  ftValue={splits.ftCancelledOrders}
                  repeatValue={splits.repeatCancelledOrders}
                />
                <HealthCard
                  label="RTO Orders"
                  tagline="shipped out, came back unclaimed"
                  value={splits.rtoOrders}
                  previous={data.previousTotals?.rtoOrders ?? 0}
                  pctOfOrders={
                    data.totals.orders > 0
                      ? (splits.rtoOrders / data.totals.orders) * 100
                      : 0
                  }
                  accent={AMBER}
                  icon={<PackageX size={18} />}
                  sparkData={data.periods}
                  sparkKey="rtoOrders"
                  currentRange={currentRange}
                  previousRange={previousRange}
                  ftValue={splits.ftRtoOrders}
                  repeatValue={splits.repeatRtoOrders}
                />
              </div>
            </div>
          )}

          {/* ─── Deep Dive — every trend the trending page showed, now here ─── */}
          <div className="pt-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px" style={{ background: "#e8dfd0" }} />
              <div className="flex flex-col items-center text-center">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: AMBER }}
                >
                  Deep Dive
                </span>
                <span className="mt-0.5 text-sm font-semibold" style={{ color: INK }}>
                  Products, payment methods & discount codes
                </span>
              </div>
              <div className="flex-1 h-px" style={{ background: "#e8dfd0" }} />
            </div>
            {currentRange && (
              <p
                className="mt-2 text-center text-[11px] italic"
                style={{ color: "#9a8571" }}
              >
                Zooming in on {currentRange}. Product composition, payment methods, and discount codes.
              </p>
            )}
          </div>

          {salesLoading && (
            <div className="flex items-center justify-center py-12">
              <div
                className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: `${AMBER} transparent ${AMBER} ${AMBER}` }}
              />
            </div>
          )}
          {!salesLoading &&
            salesData &&
            salesData.totalOrders > 0 &&
            Array.isArray(salesData.dailyBreakdown) &&
            salesData.dailyBreakdown.length > 0 && (
              <SalesTrendingExtras data={salesData} />
            )}
          {!salesLoading && salesData && salesData.totalOrders === 0 && (
            <div
              className="rounded-2xl border p-8 text-center text-sm"
              style={{ background: "white", borderColor: "#e8dfd0", color: "#9a8571" }}
            >
              No order-level detail for this window yet.
            </div>
          )}
        </>
      )}
    </div>
  );
}
