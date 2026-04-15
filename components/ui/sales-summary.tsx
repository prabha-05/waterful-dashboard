"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker, DateRange } from "react-day-picker";
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
import { Calendar } from "lucide-react";
import { SalesSummaryPanels } from "./sales-summary-panels";
import { CollapsibleCard } from "./collapsible-card";
import type { SalesMetrics } from "@/lib/sales-aggregations";

type Mode = "day" | "range";

type DailyData = SalesMetrics & { date: string };
type PeriodData = SalesMetrics & {
  from: string;
  to: string;
  dailyTrend: { date: string; revenue: number; orders: number }[];
};

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

function isPeriodData(d: DailyData | PeriodData | null): d is PeriodData {
  return !!d && "dailyTrend" in d;
}

export function SalesSummary() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>("day");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [range, setRange] = useState<DateRange | undefined>();
  const [showPicker, setShowPicker] = useState(false);
  const [data, setData] = useState<DailyData | PeriodData | null>(null);
  const [loading, setLoading] = useState(false);

  const pushUrl = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    router.replace(`/dashboard/sales/summary${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const fetchDaily = async (date: Date) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/daily?date=${formatDate(date)}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
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
    const m = searchParams.get("mode");
    const dateParam = searchParams.get("date");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    if (m === "range" || (fromParam && toParam)) {
      setMode("range");
      if (fromParam && toParam) {
        const from = parseDateStr(fromParam);
        const to = parseDateStr(toParam);
        if (from && to) {
          setRange({ from, to });
          fetchPeriod(from, to);
        }
      }
    } else if (m === "day" || dateParam) {
      setMode("day");
      if (dateParam) {
        const d = parseDateStr(dateParam);
        if (d) {
          setSelectedDate(d);
          fetchDaily(d);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setData(null);
    setShowPicker(false);
    setSelectedDate(undefined);
    setRange(undefined);
    pushUrl({ mode: m });
  };

  const pickDay = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setShowPicker(false);
    fetchDaily(date);
    pushUrl({ mode: "day", date: formatDate(date) });
  };

  const applyPreset = (days: number) => {
    const to = new Date(2025, 8, 30);
    const from = new Date(to);
    from.setDate(from.getDate() - days + 1);
    setRange({ from, to });
    setShowPicker(false);
    fetchPeriod(from, to);
    pushUrl({ mode: "range", from: formatDate(from), to: formatDate(to) });
  };

  const applyRange = () => {
    if (range?.from && range?.to) {
      setShowPicker(false);
      fetchPeriod(range.from, range.to);
      pushUrl({ mode: "range", from: formatDate(range.from), to: formatDate(range.to) });
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode toggle + picker row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Segmented control */}
        <div className="inline-flex items-center rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
          {(["day", "range"] as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`relative rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  active
                    ? "bg-gradient-to-br from-slate-900 to-indigo-900 text-white shadow-sm"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {m === "day" ? "Single Day" : "Date Range"}
              </button>
            );
          })}
        </div>

        {/* Picker trigger */}
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
          >
            <Calendar size={16} className="text-indigo-500" />
            {mode === "day"
              ? selectedDate
                ? selectedDate.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "Select a date"
              : range?.from && range?.to
                ? `${range.from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} — ${range.to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                : "Select date range"}
          </button>

          {showPicker && (
            <div className="absolute z-50 mt-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl">
              {mode === "day" ? (
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
                </>
              )}
            </div>
          )}
        </div>

        {mode === "range" && (
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.days)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-700"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        </div>
      )}

      {/* Empty */}
      {!loading && !data && (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm text-neutral-400">
            {mode === "day"
              ? "Pick a date to view daily sales metrics."
              : "Pick a date range or preset to view period metrics."}
          </p>
        </div>
      )}

      {/* No-data */}
      {!loading && data && data.totalOrders === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-sm text-neutral-500">
            {mode === "day" ? "No orders found for this date." : "No orders found in this period."}
          </p>
        </div>
      )}

      {/* Data */}
      {!loading && data && data.totalOrders > 0 && (
        <>
          {isPeriodData(data) && (
            <CollapsibleCard title="Daily Revenue Trend">
              <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={data.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value, name) =>
                        name === "revenue"
                          ? [`₹${Number(value).toLocaleString()}`, "Revenue"]
                          : [value, "Orders"]
                      }
                    />
                    <Line type="monotone" dataKey="revenue" stroke="#4338ca" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CollapsibleCard>
          )}

          <SalesSummaryPanels metrics={data} />
        </>
      )}
    </div>
  );
}
