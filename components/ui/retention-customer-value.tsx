"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import {
  Calendar,
  Gem,
  TrendingDown,
  IndianRupee,
  Gauge,
  Rocket,
  Crown,
} from "lucide-react";

const PAPER = "#fdfaf4";
const ROSE = "#d97777";
const SAGE = "#7a9471";
const AMBER = "#c99954";
const INK = "#4a3a2e";

type Metrics = {
  totalAov: number;
  dropOff: number;
  arpu: number;
  arpuExpansion: number;
  ltv: number;
  ltvExpansion: number;
  retentionRate: number;
  repeatFrequency: number;
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

function KpiCard({
  label, value, subtitle, icon, color, note,
}: {
  label: string; value: string; subtitle?: string; icon: React.ReactNode; color: string; note?: string;
}) {
  return (
    <div className="rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ background: "white", borderColor: "#e8dfd0" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9a8571" }}>{label}</p>
          {subtitle && <p className="mt-0.5 text-[10px] italic" style={{ color: "#b5a48e" }}>{subtitle}</p>}
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}18`, color }}>{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-bold tabular-nums" style={{ color: INK }}>{value}</p>
      {note && <p className="mt-1.5 text-xs" style={{ color: "#9a8571" }}>{note}</p>}
    </div>
  );
}

/* ─── Formula card ─── */
function FormulaCard({
  title, result, formula, variables, color,
}: {
  title: string; result: string; formula: string; variables: { name: string; value: string }[]; color: string;
}) {
  return (
    <div className="rounded-2xl border p-6 shadow-sm" style={{ background: "white", borderColor: "#e8dfd0" }}>
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-sm font-bold" style={{ background: color }}>f</span>
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9a8571" }}>{title}</p>
      </div>
      <p className="text-4xl font-bold tabular-nums mb-4" style={{ color: INK }}>{result}</p>
      <div className="rounded-xl p-4 mb-3" style={{ background: PAPER }}>
        <p className="font-mono text-sm font-medium" style={{ color: INK }}>{formula}</p>
      </div>
      <div className="space-y-2">
        {variables.map((v) => (
          <div key={v.name} className="flex items-center justify-between text-xs">
            <span style={{ color: "#9a8571" }}>{v.name}</span>
            <span className="font-bold tabular-nums" style={{ color: INK }}>{v.value}</span>
          </div>
        ))}
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
export function RetentionCustomerValue() {
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
    router.replace(`/dashboard/retention/customer-value${qs ? `?${qs}` : ""}`, { scroll: false });
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

  const ordersPerCustomer = data && data.totalCustomers > 0
    ? (data.totalOrders / data.totalCustomers).toFixed(1)
    : "0";

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
            <div className="absolute z-50 mt-2 rounded-xl border p-4 shadow-xl" style={{ background: "white", borderColor: "#e8dfd0" }}>
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
                  <DayPicker mode="range" selected={range} onSelect={setRange} endMonth={new Date()} startMonth={new Date(2022, 0)} captionLayout="dropdown" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button key={p.days} onClick={() => applyPreset(p.days)} className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-amber-50" style={{ borderColor: "#e8dfd0", color: INK }}>{p.label}</button>
                    ))}
                  </div>
                  <button onClick={applyRange} className="mt-3 w-full rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm" style={{ background: SAGE }}>Apply range</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: `${ROSE} transparent ${ROSE} ${ROSE}` }} />
        </div>
      )}

      {!loading && data && data.totalOrders > 0 && (
        <>
          {/* Hero: LTV vs LTV Expansion */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FormulaCard
              title="Customer Lifetime Value"
              result={formatCurrency(data.ltv)}
              formula="LTV = AOV x Orders per Customer"
              color={SAGE}
              variables={[
                { name: "AOV", value: formatCurrency(data.totalAov) },
                { name: "Orders / Customer", value: ordersPerCustomer },
              ]}
            />
            <FormulaCard
              title="LTV Expansion"
              result={formatCurrency(data.ltvExpansion)}
              formula="LTV = AOV x [1 + (Retention% x Frequency)]"
              color={AMBER}
              variables={[
                { name: "AOV", value: formatCurrency(data.totalAov) },
                { name: "Retention Rate", value: `${data.retentionRate}%` },
                { name: "Repeat Frequency", value: `${data.repeatFrequency}x` },
              ]}
            />
          </div>

          {/* Supporting KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="Total AOV" subtitle="avg order value" value={formatCurrency(data.totalAov)} icon={<Gauge size={20} />} color={AMBER} note={`Across ${data.totalOrders.toLocaleString()} orders`} />
            <KpiCard label="ARPU" subtitle="revenue per user" value={formatCurrency(data.arpu)} icon={<IndianRupee size={20} />} color={SAGE} note={`${data.totalCustomers.toLocaleString()} customers`} />
            <KpiCard label="ARPU Expansion" subtitle="growth potential" value={formatCurrency(data.arpuExpansion)} icon={<Rocket size={20} />} color={ROSE} note="AOV x Retention% x Frequency" />
          </div>

          {/* Drop-off + summary */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: "#e8dfd0" }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${ROSE}18`, color: ROSE }}>
                  <TrendingDown size={20} />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9a8571" }}>Drop-Off Rate</p>
                  <p className="text-[10px] italic" style={{ color: "#b5a48e" }}>one-and-done customers</p>
                </div>
              </div>
              <p className="text-4xl font-bold tabular-nums" style={{ color: ROSE }}>{data.dropOff}%</p>
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full" style={{ background: "#f1e7d3" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(data.dropOff, 100)}%`, background: ROSE }} />
              </div>
              <p className="mt-3 text-xs" style={{ color: "#9a8571" }}>
                First-time customers who never placed a second order. Lower is better.
              </p>
            </div>

            <div className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: "#e8dfd0" }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${AMBER}18`, color: AMBER }}>
                  <Crown size={20} />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9a8571" }}>The Takeaway</p>
                  <p className="text-[10px] italic" style={{ color: "#b5a48e" }}>what the numbers say</p>
                </div>
              </div>
              <div className="space-y-3 text-sm" style={{ color: INK }}>
                <p>
                  Each customer is worth <span className="font-bold">{formatCurrency(data.ltv)}</span> on average.
                  With improved retention, that could grow to <span className="font-bold" style={{ color: SAGE }}>{formatCurrency(data.ltvExpansion)}</span>.
                </p>
                <p>
                  You earn <span className="font-bold">{formatCurrency(data.arpu)}</span> per user today.
                  The expansion potential is <span className="font-bold" style={{ color: AMBER }}>{formatCurrency(data.arpuExpansion)}</span> if
                  retention and frequency hold.
                </p>
                {data.dropOff > 80 && (
                  <p className="rounded-xl p-3 text-xs" style={{ background: "#fef5f0", color: ROSE }}>
                    {data.dropOff}% drop-off is high. Focus on post-purchase engagement to bring first-timers back.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {!loading && data && data.totalOrders === 0 && (
        <div className="rounded-2xl border p-8 text-center" style={{ background: "white", borderColor: "#e8dfd0" }}>
          <p className="text-sm" style={{ color: "#9a8571" }}>No orders found for this date range.</p>
        </div>
      )}
    </div>
  );
}
