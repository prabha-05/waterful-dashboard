"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { SalesMetricsView, SalesMetricsViewData } from "./sales-metrics-view";

type DailyData = SalesMetricsViewData & { date: string };

export function SpecificDay() {
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [showCalendar, setShowCalendar] = useState(false);
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchForDate = async (dateStr: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/daily?date=${dateStr}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (!dateParam) return;
    const [y, m, d] = dateParam.split("-").map(Number);
    if (!y || !m || !d) return;
    setSelectedDate(new Date(y, m - 1, d));
    fetchForDate(dateParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDateSelect = async (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setShowCalendar(false);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    fetchForDate(dateStr);
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          className="flex items-center gap-3 px-5 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors shadow-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {selectedDate
            ? selectedDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
            : "Select a date"}
        </button>

        {showCalendar && (
          <div className="absolute z-50 mt-2 bg-white border border-neutral-200 rounded-xl shadow-lg p-3">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              endMonth={new Date()}
              startMonth={new Date(2022, 0)}
              captionLayout="dropdown"
            />
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-neutral-300 border-t-neutral-900 rounded-full" />
        </div>
      )}

      {!loading && data && data.totalOrders === 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center">
          <p className="text-neutral-500 text-sm">No orders found for this date.</p>
        </div>
      )}

      {!loading && data && data.totalOrders > 0 && selectedDate && (
        <SalesMetricsView
          data={data}
          detailQuery={`date=${`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`}`}
        />
      )}

      {!loading && !data && !selectedDate && (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <p className="text-neutral-400 text-sm">Pick a date to view daily sales metrics.</p>
        </div>
      )}
    </div>
  );
}
