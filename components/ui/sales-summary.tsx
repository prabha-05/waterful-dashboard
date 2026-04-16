"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Calendar } from "lucide-react";
import { SalesSummaryPanels } from "./sales-summary-panels";
import type { SalesMetrics } from "@/lib/sales-aggregations";

type DailyData = SalesMetrics & { date: string };

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

export function SalesSummary() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedDate, setSelectedDate] = useState<Date>(yesterday());
  const [showPicker, setShowPicker] = useState(false);
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(false);

  const pushUrl = (date: Date) => {
    const qs = new URLSearchParams({ date: formatDate(date) }).toString();
    router.replace(`/dashboard/sales/summary?${qs}`, { scroll: false });
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

  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (dateParam) {
      const d = parseDateStr(dateParam);
      if (d) {
        setSelectedDate(d);
        fetchDaily(d);
        return;
      }
    }
    fetchDaily(selectedDate);
    pushUrl(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickDay = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setShowPicker(false);
    fetchDaily(date);
    pushUrl(date);
  };

  return (
    <div className="space-y-6">
      <div className="relative inline-block">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
        >
          <Calendar size={16} className="text-indigo-500" />
          {selectedDate.toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </button>

        {showPicker && (
          <div className="absolute z-50 mt-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl">
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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        </div>
      )}

      {!loading && data && data.totalOrders === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-sm text-neutral-500">No orders found for this date.</p>
        </div>
      )}

      {!loading && data && data.totalOrders > 0 && (
        <SalesSummaryPanels metrics={data} />
      )}
    </div>
  );
}
