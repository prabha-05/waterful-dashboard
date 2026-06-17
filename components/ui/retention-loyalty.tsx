"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import {
  Calendar,
  Repeat,
  ShoppingBag,
  IndianRupee,
  Gauge,
  Percent,
  BarChart3,
} from "lucide-react";

const PAPER = "#fdfaf4";
const ROSE = "#d97777";
const SAGE = "#7a9471";
const AMBER = "#c99954";
const INK = "#4a3a2e";

type Metrics = {
  repeatCustomers: number;
  repeatOrders: number;
  repeatRevenue: number;
  repeatAov: number;
  retentionRate: number;
  repeatFrequency: number;
  totalOrders: number;
  totalCustomers: number;
  totalRevenue: number;
  ftCustomers: number;
  dropOff: number;
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

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: "#e8dfd0" }}>
      <span className="text-sm" style={{ color: "#9a8571" }}>{label}</span>
      <span className="text-lg font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

/* ─── Funnel visual ─── */
function RetentionFunnel({ total, repeat, dropOff }: { total: number; repeat: number; dropOff: number }) {
  const repeatPct = total > 0 ? (repeat / total) * 100 : 0;
  const dropPct = total > 0 ? dropOff : 0;

  return (
    <div className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: "#e8dfd0" }}>
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9a8571" }}>
        Retention Funnel
      </p>
      <div className="space-y-3">
        {/* All customers */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: INK }}>All Customers</span>
            <span className="font-bold" style={{ color: INK }}>{total.toLocaleString()}</span>
          </div>
          <div className="h-8 w-full rounded-lg" style={{ background: AMBER }}></div>
        </div>
        {/* Repeat */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: INK }}>Came Back</span>
            <span className="font-bold" style={{ color: SAGE }}>{repeat.toLocaleString()} ({repeatPct.toFixed(1)}%)</span>
          </div>
          <div className="h-8 overflow-hidden rounded-lg" style={{ background: "#f1e7d3" }}>
            <div className="h-full rounded-lg transition-all duration-500" style={{ width: `${repeatPct}%`, background: SAGE }}></div>
          </div>
        </div>
        {/* Drop off */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: INK }}>Dropped Off</span>
            <span className="font-bold" style={{ color: ROSE }}>{(total - repeat).toLocaleString()} ({dropPct.toFixed(1)}%)</span>
          </div>
          <div className="h-8 overflow-hidden rounded-lg" style={{ background: "#f1e7d3" }}>
            <div className="h-full rounded-lg transition-all duration-500" style={{ width: `${dropPct}%`, background: ROSE }}></div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-[11px] italic" style={{ color: "#9a8571" }}>
        Of everyone who bought, how many came back for a second order?
      </p>
    </div>
  );
}

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

/* ═══════ Main ═══════ */
export function RetentionLoyalty() {
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
    router.replace(`/dashboard/retention/loyalty${qs ? `?${qs}` : ""}`, { scroll: false });
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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: `${SAGE} transparent ${SAGE} ${SAGE}` }} />
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="Repeat Customers" subtitle="they came back" value={data.repeatCustomers.toLocaleString()} icon={<Repeat size={20} />} color={SAGE} note={`${data.totalCustomers > 0 ? ((data.repeatCustomers / data.totalCustomers) * 100).toFixed(1) : 0}% of all customers`} />
            <KpiCard label="Repeat Orders" subtitle="orders after the first" value={data.repeatOrders.toLocaleString()} icon={<ShoppingBag size={20} />} color={AMBER} note={`${data.totalOrders > 0 ? ((data.repeatOrders / data.totalOrders) * 100).toFixed(1) : 0}% of all orders`} />
            <KpiCard label="Repeat Revenue" subtitle="money from loyalists" value={formatCurrency(data.repeatRevenue)} icon={<IndianRupee size={20} />} color={ROSE} note={`${data.totalRevenue > 0 ? ((data.repeatRevenue / data.totalRevenue) * 100).toFixed(1) : 0}% of total revenue`} />
          </div>

          {/* Key rates */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="Retention Rate" subtitle="who came back for more" value={`${data.retentionRate}%`} icon={<Percent size={20} />} color={SAGE} note="Customers with 2+ orders / all customers" />
            <KpiCard label="Repeat Frequency" subtitle="avg extra orders" value={`${data.repeatFrequency}x`} icon={<BarChart3 size={20} />} color={AMBER} note="How many times repeat buyers reorder" />
            <KpiCard label="Repeat AOV" subtitle="avg repeat order value" value={formatCurrency(data.repeatAov)} icon={<Gauge size={20} />} color={ROSE} />
          </div>

          {/* Funnel */}
          <RetentionFunnel
            total={data.totalCustomers}
            repeat={data.repeatCustomers}
            dropOff={data.dropOff}
          />
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
