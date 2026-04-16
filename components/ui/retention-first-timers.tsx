"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import {
  Calendar,
  UserPlus,
  ShoppingBag,
  IndianRupee,
  Gauge,
  TrendingUp,
} from "lucide-react";

/* ─── palette ─── */
const PAPER = "#fdfaf4";
const ROSE = "#d97777";
const SAGE = "#7a9471";
const AMBER = "#c99954";
const INK = "#4a3a2e";

type Metrics = {
  ftOrders: number;
  ftCustomers: number;
  ftRevenue: number;
  ftAov: number;
  totalOrders: number;
  totalCustomers: number;
  totalRevenue: number;
};

function formatCurrency(value: number) {
  if (value >= 10000000) return `\u20B9${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `\u20B9${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `\u20B9${(value / 1000).toFixed(1)}K`;
  return `\u20B9${value}`;
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateStr(s: string): Date | null {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const PRESETS: { label: string; days: number }[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 180 days", days: 180 },
  { label: "Last 365 days", days: 365 },
];

/* ─── KPI card ─── */
function KpiCard({
  label,
  value,
  subtitle,
  icon,
  color,
  note,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  note?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ background: "white", borderColor: "#e8dfd0" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "#9a8571" }}
          >
            {label}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-[10px] italic" style={{ color: "#b5a48e" }}>
              {subtitle}
            </p>
          )}
        </div>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </span>
      </div>
      <p
        className="mt-4 text-3xl font-bold tabular-nums"
        style={{ color: INK }}
      >
        {value}
      </p>
      {note && (
        <p className="mt-1.5 text-xs" style={{ color: "#9a8571" }}>
          {note}
        </p>
      )}
    </div>
  );
}

/* ─── Insight card ─── */
function InsightCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-5 shadow-sm"
      style={{ background: "white", borderColor: "#e8dfd0" }}
    >
      <p
        className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "#9a8571" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

/* ─── Gauge bar ─── */
function GaugeBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: INK }}>{label}</span>
        <span className="font-bold tabular-nums" style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "#f1e7d3" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

/* ═══════ Main ═══════ */
export function RetentionFirstTimers() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"single" | "range">("range");
  const [selectedDate, setSelectedDate] = useState<Date>(yesterday());
  const [range, setRange] = useState<DateRange | undefined>();
  const [showPicker, setShowPicker] = useState(false);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);

  const pushUrl = (params: Record<string, string>) => {
    const qs = new URLSearchParams({ mode, ...params }).toString();
    router.replace(`/dashboard/retention/first-timers${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const fetchRange = async (from: Date, to: Date) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/retention/metrics?from=${formatDate(from)}&to=${formatDate(to)}`);
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchSingle = async (date: Date) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/retention/metrics-daily?date=${formatDate(date)}`);
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days + 1);
    setRange({ from, to });
    setShowPicker(false);
    fetchRange(from, to);
    pushUrl({ from: formatDate(from), to: formatDate(to) });
  };

  const applyRange = () => {
    if (range?.from && range?.to) {
      setShowPicker(false);
      fetchRange(range.from, range.to);
      pushUrl({ from: formatDate(range.from), to: formatDate(range.to) });
    }
  };

  const pickDay = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setShowPicker(false);
    fetchSingle(date);
    pushUrl({ date: formatDate(date) });
  };

  const switchMode = (m: "single" | "range") => {
    setMode(m);
    setShowPicker(false);
    if (m === "single") {
      fetchSingle(selectedDate);
      pushUrl({ date: formatDate(selectedDate) });
    } else {
      if (range?.from && range?.to) {
        fetchRange(range.from, range.to);
        pushUrl({ from: formatDate(range.from), to: formatDate(range.to) });
      } else {
        applyPreset(7);
      }
    }
  };

  useEffect(() => {
    const urlMode = searchParams.get("mode");
    if (urlMode === "single") {
      setMode("single");
      const dateParam = searchParams.get("date");
      if (dateParam) {
        const d = parseDateStr(dateParam);
        if (d) { setSelectedDate(d); fetchSingle(d); return; }
      }
      fetchSingle(selectedDate);
      return;
    }
    const f = searchParams.get("from");
    const t = searchParams.get("to");
    if (f && t) {
      const from = parseDateStr(f);
      const to = parseDateStr(t);
      if (from && to) {
        setRange({ from, to });
        fetchRange(from, to);
        return;
      }
    }
    applyPreset(7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ftPctOfCustomers = data && data.totalCustomers > 0
    ? ((data.ftCustomers / data.totalCustomers) * 100)
    : 0;
  const ftPctOfRevenue = data && data.totalRevenue > 0
    ? ((data.ftRevenue / data.totalRevenue) * 100)
    : 0;
  const ftPctOfOrders = data && data.totalOrders > 0
    ? ((data.ftOrders / data.totalOrders) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Mode toggle + Date picker */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border overflow-hidden" style={{ borderColor: "#e8dfd0" }}>
          <button
            onClick={() => switchMode("single")}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: mode === "single" ? INK : "white", color: mode === "single" ? "white" : INK }}
          >
            Single Day
          </button>
          <button
            onClick={() => switchMode("range")}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: mode === "range" ? INK : "white", color: mode === "range" ? "white" : INK }}
          >
            Date Range
          </button>
        </div>

        <div className="relative inline-block">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-white/80"
            style={{ background: "white", borderColor: "#e8dfd0", color: INK }}
          >
            <Calendar size={16} style={{ color: AMBER }} />
            {mode === "single"
              ? selectedDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" })
              : range?.from && range?.to
                ? `${range.from.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — ${range.to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                : "Pick a range"}
          </button>

          {showPicker && (
            <div
              className="absolute z-50 mt-2 rounded-xl border p-4 shadow-xl"
              style={{ background: "white", borderColor: "#e8dfd0" }}
            >
              {mode === "single" ? (
                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={pickDay}
                  endMonth={new Date()}
                  startMonth={new Date(2022, 0)}
                  captionLayout="dropdown"
                />
              ) : (
                <>
                  <DayPicker
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    endMonth={new Date()}
                    startMonth={new Date(2022, 0)}
                    captionLayout="dropdown"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p.days}
                        onClick={() => applyPreset(p.days)}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-amber-50"
                        style={{ borderColor: "#e8dfd0", color: INK }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={applyRange}
                    className="mt-3 w-full rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm"
                    style={{ background: SAGE }}
                  >
                    Apply range
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: `${AMBER} transparent ${AMBER} ${AMBER}` }} />
        </div>
      )}

      {/* Content */}
      {!loading && data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="FT Customers"
              subtitle="unique new faces"
              value={data.ftCustomers.toLocaleString()}
              icon={<UserPlus size={20} />}
              color={ROSE}
              note={`${ftPctOfCustomers.toFixed(1)}% of all customers`}
            />
            <KpiCard
              label="FT Orders"
              subtitle="their first checkout"
              value={data.ftOrders.toLocaleString()}
              icon={<ShoppingBag size={20} />}
              color={SAGE}
              note={`${ftPctOfOrders.toFixed(1)}% of all orders`}
            />
            <KpiCard
              label="FT Revenue"
              subtitle="money from newcomers"
              value={formatCurrency(data.ftRevenue)}
              icon={<IndianRupee size={20} />}
              color={AMBER}
              note={`${ftPctOfRevenue.toFixed(1)}% of total revenue`}
            />
            <KpiCard
              label="FT AOV"
              subtitle="avg first order value"
              value={formatCurrency(data.ftAov)}
              icon={<Gauge size={20} />}
              color={ROSE}
              note={data.totalOrders > 0 ? `Total AOV: ${formatCurrency(Math.round(data.totalRevenue / data.totalOrders))}` : ""}
            />
          </div>

          {/* Insight panels */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <InsightCard title="First-Timer Share">
              <div className="space-y-4">
                <GaugeBar label="Share of customers" pct={ftPctOfCustomers} color={ROSE} />
                <GaugeBar label="Share of orders" pct={ftPctOfOrders} color={SAGE} />
                <GaugeBar label="Share of revenue" pct={ftPctOfRevenue} color={AMBER} />
              </div>
              <p className="mt-4 text-[11px] italic" style={{ color: "#9a8571" }}>
                How much of your business comes from first-timers vs. returning customers.
              </p>
            </InsightCard>

            <InsightCard title="What This Means">
              <div className="space-y-3">
                {ftPctOfCustomers > 80 ? (
                  <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: "#fef5f0" }}>
                    <TrendingUp size={16} style={{ color: ROSE, marginTop: 2 }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: INK }}>Acquisition-heavy</p>
                      <p className="mt-0.5 text-xs" style={{ color: "#9a8571" }}>
                        Over 80% of your customers are first-timers. Great at getting new people in the door, but retention needs attention.
                      </p>
                    </div>
                  </div>
                ) : ftPctOfCustomers > 50 ? (
                  <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: "#f5f9f3" }}>
                    <TrendingUp size={16} style={{ color: SAGE, marginTop: 2 }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: INK }}>Balanced mix</p>
                      <p className="mt-0.5 text-xs" style={{ color: "#9a8571" }}>
                        A healthy split between new and returning buyers. Keep nurturing both channels.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: "#fdf8ee" }}>
                    <TrendingUp size={16} style={{ color: AMBER, marginTop: 2 }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: INK }}>Retention-strong</p>
                      <p className="mt-0.5 text-xs" style={{ color: "#9a8571" }}>
                        Most revenue comes from repeat buyers. Your retention game is solid, but don&apos;t forget acquisition.
                      </p>
                    </div>
                  </div>
                )}
                <div className="rounded-xl border p-3" style={{ borderColor: "#e8dfd0" }}>
                  <p className="text-xs" style={{ color: "#9a8571" }}>
                    <span className="font-semibold" style={{ color: INK }}>FT AOV of {formatCurrency(data.ftAov)}</span> tells
                    you what a new customer spends on their very first order. Compare with Total AOV to see if first-timers spend more or less.
                  </p>
                </div>
              </div>
            </InsightCard>
          </div>
        </>
      )}

      {!loading && data && data.totalOrders === 0 && (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ background: "white", borderColor: "#e8dfd0" }}
        >
          <p className="text-sm" style={{ color: "#9a8571" }}>No orders found for this date range.</p>
        </div>
      )}
    </div>
  );
}
