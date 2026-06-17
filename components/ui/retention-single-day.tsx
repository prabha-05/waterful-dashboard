"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import {
  Calendar,
  UserPlus,
  Repeat,
  ShoppingBag,
  IndianRupee,
  Gauge,
  Percent,
  TrendingDown,
  Gem,
  Rocket,
} from "lucide-react";

const PAPER = "#fdfaf4";
const ROSE = "#d97777";
const SAGE = "#7a9471";
const AMBER = "#c99954";
const INK = "#4a3a2e";

type Metrics = {
  date: string;
  ftOrders: number; ftCustomers: number; ftRevenue: number; ftAov: number;
  repeatCustomers: number; repeatOrders: number; repeatRevenue: number; repeatAov: number;
  retentionRate: number; repeatFrequency: number;
  totalOrders: number; totalCustomers: number; totalRevenue: number; totalAov: number;
  dropOff: number; arpu: number; arpuExpansion: number; ltv: number; ltvExpansion: number;
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

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

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

function SectionTitle({ title, tagline }: { title: string; tagline: string }) {
  return (
    <div className="border-b pb-2" style={{ borderColor: "#e8dfd0" }}>
      <h2 className="text-base font-bold" style={{ color: INK }}>{title}</h2>
      <p className="text-[11px] italic" style={{ color: "#9a8571" }}>{tagline}</p>
    </div>
  );
}

/* ═══════ Main ═══════ */
export function RetentionSingleDay() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedDate, setSelectedDate] = useState<Date>(yesterday());
  const [showPicker, setShowPicker] = useState(false);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);

  const pushUrl = (date: Date) => {
    const qs = new URLSearchParams({ date: formatDate(date) }).toString();
    router.replace(`/dashboard/retention/single-day?${qs}`, { scroll: false });
  };

  const fetchData = async (date: Date) => {
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

  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (dateParam) {
      const d = parseDateStr(dateParam);
      if (d) {
        setSelectedDate(d);
        fetchData(d);
        return;
      }
    }
    fetchData(selectedDate);
    pushUrl(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickDay = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setShowPicker(false);
    fetchData(date);
    pushUrl(date);
  };

  return (
    <div className="space-y-6">
      {/* Date picker */}
      <div className="relative inline-block">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-white/80"
          style={{ background: "white", borderColor: "#e8dfd0", color: INK }}
        >
          <Calendar size={16} style={{ color: AMBER }} />
          {selectedDate.toLocaleDateString("en-IN", {
            weekday: "short", day: "numeric", month: "long", year: "numeric",
          })}
        </button>

        {showPicker && (
          <div className="absolute z-50 mt-2 rounded-xl border p-3 shadow-xl" style={{ background: "white", borderColor: "#e8dfd0" }}>
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={pickDay}
              endMonth={new Date()}
              startMonth={new Date(2022, 0)}
              captionLayout="dropdown"
            />
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: `${AMBER} transparent ${AMBER} ${AMBER}` }} />
        </div>
      )}

      {!loading && data && data.totalOrders === 0 && (
        <div className="rounded-2xl border p-8 text-center" style={{ background: "white", borderColor: "#e8dfd0" }}>
          <p className="text-sm" style={{ color: "#9a8571" }}>No orders found for this date.</p>
        </div>
      )}

      {!loading && data && data.totalOrders > 0 && (
        <>
          {/* ── First Timers ── */}
          <SectionTitle title="First Timers" tagline="new faces that walked in today" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="FT Customers" subtitle="new buyers" value={data.ftCustomers.toLocaleString()} icon={<UserPlus size={20} />} color={ROSE} />
            <KpiCard label="FT Orders" subtitle="first checkouts" value={data.ftOrders.toLocaleString()} icon={<ShoppingBag size={20} />} color={SAGE} />
            <KpiCard label="FT Revenue" subtitle="from newcomers" value={formatCurrency(data.ftRevenue)} icon={<IndianRupee size={20} />} color={AMBER} />
            <KpiCard label="FT AOV" subtitle="avg first order" value={formatCurrency(data.ftAov)} icon={<Gauge size={20} />} color={ROSE} />
          </div>

          {/* ── Repeat / Loyalty ── */}
          <SectionTitle title="Repeat & Loyalty" tagline="the ones who came back" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="Repeat Customers" subtitle="returning buyers" value={data.repeatCustomers.toLocaleString()} icon={<Repeat size={20} />} color={SAGE} />
            <KpiCard label="Repeat Orders" subtitle="orders from regulars" value={data.repeatOrders.toLocaleString()} icon={<ShoppingBag size={20} />} color={AMBER} />
            <KpiCard label="Repeat Revenue" subtitle="from loyalists" value={formatCurrency(data.repeatRevenue)} icon={<IndianRupee size={20} />} color={ROSE} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="Retention Rate" subtitle="came back ever" value={`${data.retentionRate}%`} icon={<Percent size={20} />} color={SAGE} />
            <KpiCard label="Repeat Frequency" subtitle="avg reorders" value={`${data.repeatFrequency}x`} icon={<Repeat size={20} />} color={AMBER} />
            <KpiCard label="Repeat AOV" subtitle="avg repeat order" value={formatCurrency(data.repeatAov)} icon={<Gauge size={20} />} color={ROSE} />
          </div>

          {/* ── Unit Economics ── */}
          <SectionTitle title="Customer Value" tagline="what each customer is worth" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="Total AOV" subtitle="all orders" value={formatCurrency(data.totalAov)} icon={<Gauge size={20} />} color={AMBER} />
            <KpiCard label="ARPU" subtitle="revenue per user" value={formatCurrency(data.arpu)} icon={<IndianRupee size={20} />} color={SAGE} />
            <KpiCard label="Drop-Off" subtitle="one-and-done" value={`${data.dropOff}%`} icon={<TrendingDown size={20} />} color={ROSE} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="LTV" subtitle="lifetime value" value={formatCurrency(data.ltv)} icon={<Gem size={20} />} color={SAGE} note="AOV x Orders per Customer" />
            <KpiCard label="LTV Expansion" subtitle="with retention growth" value={formatCurrency(data.ltvExpansion)} icon={<Rocket size={20} />} color={AMBER} note="AOV x [1 + Retention% x Frequency]" />
            <KpiCard label="ARPU Expansion" subtitle="growth potential" value={formatCurrency(data.arpuExpansion)} icon={<Rocket size={20} />} color={ROSE} note="AOV x Retention% x Frequency" />
          </div>
        </>
      )}
    </div>
  );
}
