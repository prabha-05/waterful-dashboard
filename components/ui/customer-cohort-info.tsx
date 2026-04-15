"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { Calendar, Sparkles, Crown, Users } from "lucide-react";

type FrequencyBucket = {
  label: string;
  customers: number;
  orders: number;
  revenue: number;
  pct: number;
  aov: number;
};

type FrequencyResponse = {
  from: string;
  to: string;
  totalCustomers: number;
  totalOrders: number;
  totalRevenue: number;
  buckets: FrequencyBucket[];
};

type TopCustomer = {
  name: string;
  mobile: string;
  orders: number;
  revenue: number;
  aov: number;
};

type TopCustomersResponse = {
  from: string;
  to: string;
  rows: TopCustomer[];
};

function formatCurrency(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
}

const PAPER = "#fdfaf4";
const ROSE = "#d97777";
const SAGE = "#7a9471";
const AMBER = "#c99954";
const INK = "#4a3a2e";

const PRESETS: { label: string; days: number }[] = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 180 days", days: 180 },
  { label: "Last 365 days", days: 365 },
];

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateStr(s: string): Date | null {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function CustomerCohortInfo() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [range, setRange] = useState<DateRange | undefined>();
  const [showPicker, setShowPicker] = useState(false);
  const [frequency, setFrequency] = useState<FrequencyResponse | null>(null);
  const [topCustomers, setTopCustomers] = useState<TopCustomersResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const pushUrl = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    router.replace(`/dashboard/retention/customer${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const fetchPeriod = async (from: Date, to: Date) => {
    setLoading(true);
    try {
      const [freqRes, topRes] = await Promise.all([
        fetch(`/api/retention/frequency?from=${formatDate(from)}&to=${formatDate(to)}`),
        fetch(`/api/retention/top-customers?from=${formatDate(from)}&to=${formatDate(to)}&limit=10`),
      ]);
      const [freqJson, topJson] = await Promise.all([freqRes.json(), topRes.json()]);
      setFrequency(freqJson);
      setTopCustomers(topJson);
    } catch {
      setFrequency(null);
      setTopCustomers(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const f = searchParams.get("from");
    const t = searchParams.get("to");
    if (f && t) {
      const from = parseDateStr(f);
      const to = parseDateStr(t);
      if (from && to) {
        setRange({ from, to });
        fetchPeriod(from, to);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (days: number) => {
    const to = new Date(2025, 8, 30);
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

  return (
    <div className="space-y-6">
      {/* Picker row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors"
            style={{ background: "white", borderColor: "#e8dcc8", color: INK }}
          >
            <Calendar size={16} style={{ color: ROSE }} />
            {range?.from && range?.to
              ? `${range.from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} — ${range.to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
              : "Select date range"}
          </button>

          {showPicker && (
            <div className="absolute z-50 mt-2 rounded-xl border bg-white p-3 shadow-xl" style={{ borderColor: "#e8dcc8" }}>
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
                  className="rounded px-4 py-1.5 text-sm text-white disabled:opacity-50"
                  style={{ background: INK }}
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
              className="rounded-lg border bg-white px-3 py-2 text-sm transition-colors hover:border-rose-300 hover:bg-rose-50/50"
              style={{ borderColor: "#e8dcc8", color: INK }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2"
            style={{ borderColor: "#e8dcc8", borderTopColor: INK }}
          />
        </div>
      )}

      {!loading && !frequency && (
        <div
          className="rounded-2xl border border-dashed p-12 text-center"
          style={{ borderColor: "#d9c9b0", background: "white" }}
        >
          <Sparkles className="mx-auto mb-3" size={22} style={{ color: AMBER }} />
          <p className="text-sm" style={{ color: INK }}>
            Pick a date range to see customer frequency.
          </p>
        </div>
      )}

      {!loading && frequency && frequency.totalCustomers === 0 && (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ borderColor: "#e8dcc8", background: "white", color: INK }}
        >
          <p className="text-sm">No customers ordered in this range.</p>
        </div>
      )}

      {!loading && frequency && frequency.totalCustomers > 0 && (
        <FrequencyTable data={frequency} />
      )}

      {!loading && topCustomers && topCustomers.rows.length > 0 && (
        <TopCustomersTable rows={topCustomers.rows} />
      )}
    </div>
  );
}

function TopCustomersTable({ rows }: { rows: TopCustomer[] }) {
  return (
    <section
      className="rounded-2xl border bg-white p-5 shadow-sm"
      style={{ borderColor: "#e8dcc8" }}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.3em]"
            style={{ color: AMBER, fontFamily: "Georgia, serif" }}
          >
            <Crown size={12} /> Top Customers
          </p>
          <h3
            className="mt-1 text-lg font-semibold"
            style={{ fontFamily: "Georgia, serif", color: INK }}
          >
            The regulars, ranked by spend
          </h3>
        </div>
        <p className="text-xs italic" style={{ color: "#9a8571" }}>
          Top {rows.length} in the selected range.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ background: "#f7efdf" }}>
              <th
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK, width: 48 }}
              >
                #
              </th>
              <th
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                Name
              </th>
              <th
                className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                No of Orders
              </th>
              <th
                className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                Value
              </th>
              <th
                className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                AOV
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.mobile}
                style={{ background: i % 2 === 0 ? "white" : "#fdf9f1" }}
              >
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-left tabular-nums"
                  style={{ color: "#9a8571" }}
                >
                  {i + 1}
                </td>
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-left font-medium"
                  style={{ color: INK }}
                >
                  <div className="flex flex-col">
                    <span className="truncate max-w-[260px]">{r.name}</span>
                    <span className="text-[11px]" style={{ color: "#9a8571" }}>
                      {r.mobile}
                    </span>
                  </div>
                </td>
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums"
                  style={{ color: INK }}
                >
                  {r.orders.toLocaleString()}
                </td>
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums"
                  style={{ color: INK }}
                >
                  {formatCurrency(r.revenue)}
                </td>
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums"
                  style={{ color: INK }}
                >
                  {formatCurrency(r.aov)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function barColor(label: string): string {
  if (label === "1") return ROSE;
  if (label === "2") return AMBER;
  return SAGE;
}

function FrequencyTable({ data }: { data: FrequencyResponse }) {
  const maxPct = Math.max(...data.buckets.map((b) => b.pct), 1);
  return (
    <section
      className="rounded-2xl border bg-white p-5 shadow-sm"
      style={{ borderColor: "#e8dcc8" }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.3em]"
            style={{ color: AMBER, fontFamily: "Georgia, serif" }}
          >
            <Users size={12} /> Purchase Frequency
          </p>
          <h3
            className="mt-1 text-lg font-semibold"
            style={{ fontFamily: "Georgia, serif", color: INK }}
          >
            How many times did they visit?
          </h3>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider" style={{ color: "#9a8571" }}>
            Total unique customers
          </p>
          <p
            className="text-3xl font-bold tabular-nums"
            style={{ fontFamily: "Georgia, serif", color: INK }}
          >
            {data.totalCustomers.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ background: "#f7efdf" }}>
              <th
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                Orders placed
              </th>
              <th
                className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                Customers
              </th>
              <th
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK, width: "28%" }}
              >
                % of total
              </th>
              <th
                className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                Revenue
              </th>
              <th
                className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                AOV
              </th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b, i) => (
              <tr key={b.label} style={{ background: i % 2 === 0 ? "white" : "#fdf9f1" }}>
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-left font-medium"
                  style={{ color: INK }}
                >
                  {b.label === "1" ? "1 order" : `${b.label} orders`}
                </td>
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums"
                  style={{ color: INK }}
                >
                  {b.customers.toLocaleString()}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2 flex-1 overflow-hidden rounded-full"
                      style={{ background: "#f1e7d3" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(b.pct / maxPct) * 100}%`,
                          background: barColor(b.label),
                        }}
                      />
                    </div>
                    <span className="w-14 text-right tabular-nums" style={{ color: INK }}>
                      {b.pct.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums"
                  style={{ color: INK }}
                >
                  {formatCurrency(b.revenue)}
                </td>
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums"
                  style={{ color: INK }}
                >
                  {b.aov > 0 ? formatCurrency(b.aov) : "—"}
                </td>
              </tr>
            ))}
            <tr style={{ background: "#f7efdf" }}>
              <td
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                Total
              </td>
              <td
                className="px-4 py-3 text-right font-semibold tabular-nums"
                style={{ color: INK }}
              >
                {data.totalCustomers.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-left text-[11px]" style={{ color: "#9a8571" }}>
                {data.totalOrders.toLocaleString()} orders
              </td>
              <td
                className="px-4 py-3 text-right font-semibold tabular-nums"
                style={{ color: INK }}
              >
                {formatCurrency(data.totalRevenue)}
              </td>
              <td
                className="px-4 py-3 text-right font-semibold tabular-nums"
                style={{ color: INK }}
              >
                {data.totalOrders > 0
                  ? formatCurrency(Math.round(data.totalRevenue / data.totalOrders))
                  : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs italic" style={{ color: "#9a8571" }}>
        One-and-done vs. the regulars. 5+ means 6 or more orders in this range.
      </p>
    </section>
  );
}

export { PAPER };
