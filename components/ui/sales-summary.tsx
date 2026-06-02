"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";
import { SalesSummaryPanels } from "./sales-summary-panels";
import type { SalesMetrics } from "@/lib/sales-aggregations";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const BORDER = "#e8dfd0";
const CREAM_BG = "#faf6ef";

type RangeData = SalesMetrics & { from: string; to: string };

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function nDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Quick-select presets that map to {from, to} pairs.
type Preset = "today" | "yesterday" | "last7" | "last30";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
];
function presetRange(p: Preset): { from: string; to: string } {
  const today = new Date();
  if (p === "today") return { from: formatDate(today), to: formatDate(today) };
  if (p === "yesterday") {
    const y = formatDate(yesterday());
    return { from: y, to: y };
  }
  if (p === "last7") return { from: formatDate(nDaysAgo(7)), to: formatDate(yesterday()) };
  return { from: formatDate(nDaysAgo(30)), to: formatDate(yesterday()) };
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
  const [presetOpen, setPresetOpen] = useState(false);

  // Detect which preset (if any) matches the current from/to so the dropdown
  // can show the right label. "Custom" when nothing matches.
  const activePresetLabel = useMemo(() => {
    for (const p of PRESETS) {
      const r = presetRange(p.id);
      if (r.from === from && r.to === to) return p.label;
    }
    return "Custom";
  }, [from, to]);

  const applyPreset = (p: Preset) => {
    const r = presetRange(p);
    setFrom(r.from);
    setTo(r.to);
    setPresetOpen(false);
  };

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
      {/* FROM / TO range picker + quick preset dropdown */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm"
        style={{ background: "white", borderColor: BORDER }}
      >
        {/* Quick preset dropdown (Today / Yesterday / Last 7d / Last 30d) */}
        <div className="relative">
          <button
            onClick={() => setPresetOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-white/80"
            style={{ background: CREAM_BG, borderColor: BORDER, color: INK }}
          >
            <Calendar size={14} style={{ color: AMBER }} />
            {activePresetLabel}
            <ChevronDown size={14} style={{ color: MUTED }} />
          </button>
          {presetOpen && (
            <div
              className="absolute z-40 mt-1 min-w-[160px] rounded-lg border shadow-xl overflow-hidden"
              style={{ background: "white", borderColor: BORDER }}
            >
              {PRESETS.map((p) => {
                const isActive = activePresetLabel === p.label;
                return (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-amber-50"
                    style={{
                      color: INK,
                      background: isActive ? `${AMBER}22` : "transparent",
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
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
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-sm text-neutral-500">No orders found in this range.</p>
        </div>
      )}

      {!loading && data && data.totalOrders > 0 && (
        <SalesSummaryPanels metrics={data} />
      )}
    </div>
  );
}
