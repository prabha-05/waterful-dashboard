"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, RefreshCw } from "lucide-react";
import { SalesSummaryPanels } from "./sales-summary-panels";
import type { SalesMetrics } from "@/lib/sales-aggregations";

const INK = "#ffffff";
const MUTED = "#94a3b8";
const AMBER = "#f97316";
const BORDER = "#1e293b";
const CREAM_BG = "#0f172a";

type RangeData = SalesMetrics & { from: string; to: string };

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today(): Date {
  return new Date();
}

export function SalesSummary() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Default: today (single day). User can extend the range with the picker.
  const defaultDay = formatDate(today());
  const [from, setFrom] = useState<string>(defaultDay);
  const [to, setTo] = useState<string>(defaultDay);
  const [data, setData] = useState<RangeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  // Pull the latest orders from Shopify on demand, then reload the numbers.
  // Auth rides on the login session cookie (no CRON_SECRET in the browser);
  // `wait=true` blocks until the sync finishes so the refetch shows fresh data.
  const refreshFromShopify = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/shopify/sync?wait=true");
      if (!res.ok) throw new Error(String(res.status));
      await fetchRange(from, to);
    } catch {
      // Best-effort — leave the currently shown numbers in place on failure.
    } finally {
      setSyncing(false);
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
        style={{ background: "#0f172a", borderColor: BORDER }}
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
        <button
          type="button"
          onClick={refreshFromShopify}
          disabled={syncing}
          title="Pull the latest orders from Shopify, then refresh these numbers"
          className="ml-auto flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60"
          style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
        >
          <RefreshCw
            size={14}
            className={syncing ? "animate-spin" : ""}
            style={{ color: AMBER }}
          />
          {syncing ? "Syncing…" : "Refresh from Shopify"}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-neutral-900" />
        </div>
      )}

      {!loading && data && data.totalOrders === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-sm text-slate-400">No orders found in this range.</p>
        </div>
      )}

      {!loading && data && data.totalOrders > 0 && (
        <SalesSummaryPanels metrics={data} from={from} to={to} />
      )}
    </div>
  );
}
