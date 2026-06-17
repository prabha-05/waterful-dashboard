"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { SalesMetricsView, SalesMetricsViewData } from "./sales-metrics-view";
import { CollapsibleCard } from "./collapsible-card";

type PeriodData = SalesMetricsViewData & {
  from: string;
  to: string;
  dailyTrend: { date: string; revenue: number; orders: number }[];
};

function formatCurrency(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRESETS: { label: string; days: number }[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 365 days", days: 365 },
];

export function PeriodView() {
  const searchParams = useSearchParams();
  const [range, setRange] = useState<DateRange | undefined>();
  const [showPicker, setShowPicker] = useState(false);
  const [data, setData] = useState<PeriodData | null>(null);
  const [loading, setLoading] = useState(false);

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
      const [fy, fm, fd] = fromParam.split("-").map(Number);
      const [ty, tm, td] = toParam.split("-").map(Number);
      if (fy && fm && fd && ty && tm && td) {
        const from = new Date(fy, fm - 1, fd);
        const to = new Date(ty, tm - 1, td);
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
  };

  const applyRange = () => {
    if (range?.from && range?.to) {
      setShowPicker(false);
      fetchPeriod(range.from, range.to);
    }
  };

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-3 px-5 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {range?.from && range?.to
              ? `${range.from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} — ${range.to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
              : "Select date range"}
          </button>

          {showPicker && (
            <div className="absolute z-50 mt-2 bg-white border border-neutral-200 rounded-xl shadow-lg p-3">
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
                  className="px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={applyRange}
                  disabled={!range?.from || !range?.to}
                  className="px-4 py-1.5 text-sm bg-neutral-900 text-white rounded hover:bg-neutral-800 disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.days)}
              className="px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg border border-neutral-200 bg-white"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-neutral-300 border-t-neutral-900 rounded-full" />
        </div>
      )}

      {!loading && !data && (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <p className="text-neutral-400 text-sm">Pick a date range or preset to view period metrics.</p>
        </div>
      )}

      {!loading && data && data.totalOrders === 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center">
          <p className="text-neutral-500 text-sm">No orders found in this period.</p>
        </div>
      )}

      {!loading && data && data.totalOrders > 0 && (
        <>
          {/* Daily trend line chart */}
          <CollapsibleCard title="Daily Revenue Trend">
            <div className="h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value, name) => name === "revenue" ? [`₹${Number(value).toLocaleString()}`, "Revenue"] : [value, "Orders"]} />
                  <Line type="monotone" dataKey="revenue" stroke="#171717" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CollapsibleCard>

          <SalesMetricsView
            data={data}
            detailQuery={`from=${data.from}&to=${data.to}`}
          />
        </>
      )}
    </div>
  );
}
