"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";
import { SalesSummaryPanels } from "./sales-summary-panels";
import type { SalesMetrics } from "@/lib/sales-aggregations";

const INK = "#ffffff";
const MUTED = "#9ca3af";
const AMBER = "#22c5ff";
const BORDER = "#1a1a1a";
const CREAM_BG = "#0a0a0a";

type RangeData = SalesMetrics & { from: string; to: string };

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

export function SalesSummary() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Default: yesterday (single day). User can extend the range with the picker.
  const defaultDay = formatDate(yesterday());
  const [from, setFrom] = useState<string>(defaultDay);
  const [to, setTo] = useState<string>(defaultDay);
  const [data, setData] = useState<RangeData | null>(null);
  const [loading, setLoading] = useState(false);

  const pushUrl = (f: string, t: string) => {
    const qs = new URLSearchParams({ from: f, to: t }).toString();
    router.replace(`/dashboard/sales/summary?${qs}`, { scroll: false });
  };

  const fetchRange = async (f: string, t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/range?from=${f}&to=${t}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // On first mount, read query params if present, else use defaults.
  useEffect(() => {
    const qFrom = searchParams.get("from");
    const qTo = searchParams.get("to");
    if (qFrom && qTo) {
      setFrom(qFrom);
      setTo(qTo);
      fetchRange(qFrom, qTo);
      return;
    }
    fetchRange(from, to);
    pushUrl(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever from/to change (after the initial mount), refetch + push URL.
  // Guarded so we don't re-fire on the initial state-setting effect above.
  useEffect(() => {
    if (!from || !to) return;
    fetchRange(from, to);
    pushUrl(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  return (
    <div className="space-y-6">
      {/* FROM / TO range picker (cream + amber styling) */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm"
        style={{ background: "#0a0a0a", borderColor: BORDER }}
      >
        <div className="flex items-center gap-2">
          <Calendar size={14} style={{ color: AMBER }} />
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
            From
          </label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
            To
          </label>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        </div>
      )}

      {!loading && data && data.totalOrders === 0 && (
        <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-8 text-center">
          <p className="text-sm text-neutral-500">No orders found in this range.</p>
        </div>
      )}

      {!loading && data && data.totalOrders > 0 && (
        <SalesSummaryPanels metrics={data} />
      )}
    </div>
  );
}
