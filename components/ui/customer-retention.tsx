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
import {
  Calendar,
  Users,
  Repeat,
  TrendingUp,
  HeartCrack,
  Sparkles,
} from "lucide-react";
import type { CohortMetrics, ProductCohortMetrics } from "@/lib/retention-cohorts";

type CohortsResponse = {
  from: string;
  to: string;
  cohorts: CohortMetrics[];
  productCohorts: ProductCohortMetrics[];
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

// Cute office palette
const PAPER = "#fdfaf4";
const ROSE = "#d97777";
const SAGE = "#7a9471";
const AMBER = "#c99954";
const INK = "#4a3a2e";

export function CustomerRetention() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [range, setRange] = useState<DateRange | undefined>();
  const [showPicker, setShowPicker] = useState(false);
  const [data, setData] = useState<CohortsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const pushUrl = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    router.replace(`/dashboard/retention/a${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const fetchPeriod = async (from: Date, to: Date) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/retention/cohorts?from=${formatDate(from)}&to=${formatDate(to)}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
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
    pushUrl({ from: formatDate(from), to: formatDate(to) });
  };

  const applyRange = () => {
    if (range?.from && range?.to) {
      setShowPicker(false);
      fetchPeriod(range.from, range.to);
      pushUrl({ from: formatDate(range.from), to: formatDate(range.to) });
    }
  };

  const totals = data ? computeTotals(data.cohorts) : null;

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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2"
            style={{ borderColor: "#e8dcc8", borderTopColor: INK }}
          />
        </div>
      )}

      {/* Empty */}
      {!loading && !data && (
        <div
          className="rounded-2xl border border-dashed p-12 text-center"
          style={{ borderColor: "#d9c9b0", background: "white" }}
        >
          <Sparkles className="mx-auto mb-3" size={22} style={{ color: AMBER }} />
          <p className="text-sm" style={{ color: INK }}>
            Pick a date range to see cohort retention.
          </p>
        </div>
      )}

      {/* No cohorts in range */}
      {!loading && data && data.cohorts.length === 0 && (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ borderColor: "#e8dcc8", background: "white", color: INK }}
        >
          <p className="text-sm">No new customers were acquired in this range.</p>
        </div>
      )}

      {!loading && data && data.cohorts.length > 0 && totals && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <KpiTile
              icon={<Users size={18} />}
              tone={ROSE}
              label="First-time customers"
              value={totals.ftCustomers.toLocaleString()}
              caption={`across ${data.cohorts.length} weekly cohorts`}
            />
            <KpiTile
              icon={<Repeat size={18} />}
              tone={SAGE}
              label="Ever repeat %"
              value={`${totals.repeatPct.toFixed(1)}%`}
              caption={`${totals.repeatCustomers.toLocaleString()} came back`}
            />
            <KpiTile
              icon={<TrendingUp size={18} />}
              tone={AMBER}
              label="Weighted LTV"
              value={formatCurrency(totals.ltv)}
              caption={`${totals.ltvExpansion.toFixed(2)}× their first order`}
            />
            <KpiTile
              icon={<HeartCrack size={18} />}
              tone="#a07a9a"
              label="Drop off"
              value={totals.dropOff.toLocaleString()}
              caption="never came back"
            />
          </div>

          {/* Repeat % trend chart */}
          <RepeatTrendChart cohorts={data.cohorts} />

          {/* Main cohort table */}
          <CohortTable title="Weekly Cohorts" cohorts={data.cohorts} />

          {/* Product cohort table */}
          <ProductCohortTable cohorts={data.productCohorts} />
        </>
      )}
    </div>
  );
}

function computeTotals(cohorts: CohortMetrics[]) {
  let ftCustomers = 0;
  let repeatCustomers = 0;
  let totalRevenue = 0;
  let ftOrders = 0;
  let ftRevenue = 0;
  let dropOff = 0;
  for (const c of cohorts) {
    ftCustomers += c.ftCustomers;
    repeatCustomers += c.repeatCustomers;
    totalRevenue += c.ftRevenue + c.repeatRevenue;
    ftOrders += c.ftOrders;
    ftRevenue += c.ftRevenue;
    dropOff += c.dropOff;
  }
  const repeatPct = ftCustomers > 0 ? (repeatCustomers / ftCustomers) * 100 : 0;
  const ltv = ftCustomers > 0 ? totalRevenue / ftCustomers : 0;
  const ftAov = ftOrders > 0 ? ftRevenue / ftOrders : 0;
  const ltvExpansion = ftAov > 0 ? ltv / ftAov : 0;
  return { ftCustomers, repeatCustomers, repeatPct, ltv, ltvExpansion, dropOff };
}

function KpiTile({
  icon,
  tone,
  label,
  value,
  caption,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div
      className="rounded-2xl border bg-white p-5 shadow-sm"
      style={{ borderColor: "#e8dcc8" }}
    >
      <div className="flex items-center gap-2" style={{ color: tone }}>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${tone}15` }}
        >
          {icon}
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p
        className="mt-3 text-3xl font-bold tabular-nums"
        style={{ fontFamily: "Georgia, serif", color: INK }}
      >
        {value}
      </p>
      <p className="mt-1 text-xs italic" style={{ color: "#9a8571" }}>
        {caption}
      </p>
    </div>
  );
}

function RepeatTrendChart({ cohorts }: { cohorts: CohortMetrics[] }) {
  const data = cohorts.map((c) => ({
    week: c.cohortLabel,
    "Repeat %": c.repeatPct,
    "Drop off %": 100 - c.repeatPct,
  }));
  return (
    <section
      className="rounded-2xl border bg-white p-5 shadow-sm"
      style={{ borderColor: "#e8dcc8" }}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3
          className="text-lg font-semibold"
          style={{ fontFamily: "Georgia, serif", color: INK }}
        >
          Repeat rate by cohort week
        </h3>
        <p className="text-xs italic" style={{ color: "#9a8571" }}>
          Are newer cohorts coming back more?
        </p>
      </div>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee4d0" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} width={40} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line
              type="monotone"
              dataKey="Repeat %"
              stroke={SAGE}
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="Drop off %"
              stroke={ROSE}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-center gap-5 text-xs">
        <span className="flex items-center gap-1.5" style={{ color: INK }}>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SAGE }} />
          Repeat %
        </span>
        <span className="flex items-center gap-1.5" style={{ color: INK }}>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ROSE }} />
          Drop off %
        </span>
      </div>
    </section>
  );
}

const COLUMNS: { key: keyof CohortMetrics; label: string; fmt: (v: number) => string; currency?: boolean }[] = [
  { key: "ftOrders", label: "FT Orders", fmt: (v) => v.toLocaleString() },
  { key: "ftCustomers", label: "FT Customers", fmt: (v) => v.toLocaleString() },
  { key: "ftRevenue", label: "FT Revenue", fmt: formatCurrency, currency: true },
  { key: "ftAov", label: "FT AOV", fmt: formatCurrency, currency: true },
  { key: "repeatOrders", label: "Ever Repeat Orders", fmt: (v) => v.toLocaleString() },
  { key: "repeatCustomers", label: "Ever Repeat Customers", fmt: (v) => v.toLocaleString() },
  { key: "repeatRevenue", label: "Ever Repeat Revenue", fmt: formatCurrency, currency: true },
  { key: "repeatAov", label: "Ever Repeat AOV", fmt: formatCurrency, currency: true },
  { key: "repeatPct", label: "Ever Repeat %", fmt: (v) => `${v}%` },
  { key: "repeatFrequency", label: "Repeat Frequency", fmt: (v) => v.toFixed(2) },
  { key: "totalAov", label: "Total AOV", fmt: formatCurrency, currency: true },
  { key: "dropOff", label: "Drop Off", fmt: (v) => v.toLocaleString() },
  { key: "arpu", label: "ARPU", fmt: formatCurrency, currency: true },
  { key: "arpuExpansion", label: "ARPU Expansion", fmt: (v) => `${v.toFixed(2)}×` },
  { key: "ltv", label: "LTV", fmt: formatCurrency, currency: true },
  { key: "ltvExpansion", label: "LTV Expansion", fmt: (v) => `${v.toFixed(2)}×` },
];

function monthLabel(weekKey: string): string {
  const [y, m] = weekKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function CohortTable({ title, cohorts }: { title: string; cohorts: CohortMetrics[] }) {
  return (
    <section
      className="rounded-2xl border bg-white p-5 shadow-sm"
      style={{ borderColor: "#e8dcc8" }}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3
          className="text-lg font-semibold"
          style={{ fontFamily: "Georgia, serif", color: INK }}
        >
          {title}
        </h3>
        <p className="text-xs italic" style={{ color: "#9a8571" }}>
          Each row = customers acquired in that week, followed forever.
        </p>
      </div>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ background: "#f7efdf" }}>
              <th
                className="sticky left-0 z-10 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ background: "#f7efdf", color: INK }}
              >
                Date
              </th>
              <th
                className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                Acquired Month
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="whitespace-nowrap px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: INK }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c, i) => (
              <tr
                key={c.cohortWeek}
                style={{ background: i % 2 === 0 ? "white" : "#fdf9f1" }}
              >
                <td
                  className="sticky left-0 z-10 whitespace-nowrap px-4 py-2.5 text-left font-medium"
                  style={{ background: i % 2 === 0 ? "white" : "#fdf9f1", color: INK }}
                >
                  {c.cohortLabel}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-2.5 text-left"
                  style={{ color: INK }}
                >
                  {monthLabel(c.cohortWeek)}
                </td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"
                    style={{ color: INK }}
                  >
                    {col.fmt(c[col.key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductCohortTable({ cohorts }: { cohorts: ProductCohortMetrics[] }) {
  if (cohorts.length === 0) return null;
  return (
    <section
      className="rounded-2xl border bg-white p-5 shadow-sm"
      style={{ borderColor: "#e8dcc8" }}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3
          className="text-lg font-semibold"
          style={{ fontFamily: "Georgia, serif", color: INK }}
        >
          By Product × Cohort
        </h3>
        <p className="text-xs italic" style={{ color: "#9a8571" }}>
          Which flavour brings back the loyalists?
        </p>
      </div>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ background: "#f7efdf" }}>
              <th
                className="sticky left-0 z-10 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ background: "#f7efdf", color: INK }}
              >
                Product
              </th>
              <th
                className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                Raw Date
              </th>
              <th
                className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: INK }}
              >
                ACQ_Month
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="whitespace-nowrap px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: INK }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c, i) => (
              <tr
                key={`${c.cohortWeek}-${c.product}`}
                style={{ background: i % 2 === 0 ? "white" : "#fdf9f1" }}
              >
                <td
                  className="sticky left-0 z-10 whitespace-nowrap px-4 py-2.5 text-left font-medium"
                  style={{
                    background: i % 2 === 0 ? "white" : "#fdf9f1",
                    color: INK,
                    maxWidth: 220,
                  }}
                >
                  <span className="block truncate">{c.product}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5" style={{ color: INK }}>
                  {c.cohortLabel}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5" style={{ color: INK }}>
                  {monthLabel(c.cohortWeek)}
                </td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"
                    style={{ color: INK }}
                  >
                    {col.fmt(c[col.key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Expose paper color for the page wrapper
export { PAPER };
