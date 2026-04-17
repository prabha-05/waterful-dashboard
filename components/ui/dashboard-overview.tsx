"use client";

import { useEffect, useState, useCallback } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Minus,
  Plus,
  IndianRupee,
  ShoppingBag,
  Users,
  Gauge,
  Calendar,
} from "lucide-react";

const INK = "#4a3a2e";
const ROSE = "#d97777";
const SAGE = "#7a9471";
const AMBER = "#c99954";

type Period = {
  label: string;
  from: string;
  to: string;
  orders: number;
  revenue: number;
  customers: number;
  aov: number;
  ftCustomers: number;
  repeatCustomers: number;
  cancelledOrders: number;
  rtoOrders: number;
};

type OverviewData = {
  count: number;
  unit: string;
  periods: Period[];
  totals: { orders: number; revenue: number; customers: number; aov: number };
};

function formatCurrency(value: number) {
  if (value >= 10000000) return `\u20B9${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `\u20B9${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `\u20B9${(value / 1000).toFixed(1)}K`;
  return `\u20B9${value}`;
}

const UNITS = ["day", "week", "month"] as const;
type Unit = (typeof UNITS)[number];

function KpiCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5 shadow-sm"
      style={{ background: "white", borderColor: "#e8dfd0" }}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "#9a8571" }}
        >
          {label}
        </p>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums" style={{ color: INK }}>
        {value}
      </p>
    </div>
  );
}

/* custom tooltip */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border p-3 shadow-lg text-xs"
      style={{ background: "white", borderColor: "#e8dfd0" }}
    >
      <p className="font-semibold mb-2" style={{ color: INK }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "#9a8571" }}>{p.name}:</span>
          <span className="font-bold" style={{ color: INK }}>
            {p.dataKey === "revenue" || p.dataKey === "aov"
              ? formatCurrency(p.value)
              : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DashboardOverview() {
  const [count, setCount] = useState(7);
  const [inputValue, setInputValue] = useState("7");
  const [unit, setUnit] = useState<Unit>("day");
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const [endDate, setEndDate] = useState<Date>(yesterday);
  const [showPicker, setShowPicker] = useState(false);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartMode, setChartMode] = useState<"revenue" | "orders" | "customers">("revenue");

  const fetchData = useCallback(async (c: number, u: string, end: Date) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/overview?count=${c}&unit=${u}&end=${formatDateParam(end)}`);
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(count, unit, endDate);
  }, [count, unit, endDate, fetchData]);

  const pickEndDate = (date: Date | undefined) => {
    if (!date) return;
    setEndDate(date);
    setShowPicker(false);
  };

  const inc = () => { const v = Math.min(count + 1, 52); setCount(v); setInputValue(String(v)); };
  const dec = () => { const v = Math.max(count - 1, 1); setCount(v); setInputValue(String(v)); };

  const unitLabel = (u: Unit) => ({ day: "Days", week: "Weeks", month: "Months" }[u]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Number +/- */}
        <div
          className="inline-flex items-center rounded-xl border overflow-hidden"
          style={{ borderColor: "#e8dfd0", background: "white" }}
        >
          <button
            onClick={dec}
            className="px-3 py-2.5 transition-colors hover:bg-neutral-50"
            style={{ color: INK }}
          >
            <Minus size={16} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={inputValue}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              setInputValue(raw);
            }}
            onBlur={() => {
              const v = parseInt(inputValue);
              if (!isNaN(v) && v >= 1) setCount(Math.min(v, 52));
              else setCount(1);
              setInputValue(String(Math.min(Math.max(parseInt(inputValue) || 1, 1), 52)));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = parseInt(inputValue);
                if (!isNaN(v) && v >= 1) setCount(Math.min(v, 52));
                else setCount(1);
                setInputValue(String(Math.min(Math.max(parseInt(inputValue) || 1, 1), 52)));
              }
            }}
            className="w-14 py-2.5 text-sm font-bold tabular-nums text-center border-x outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            style={{ color: INK, borderColor: "#e8dfd0" }}
          />
          <button
            onClick={inc}
            className="px-3 py-2.5 transition-colors hover:bg-neutral-50"
            style={{ color: INK }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Unit toggle */}
        <div
          className="inline-flex rounded-xl border overflow-hidden"
          style={{ borderColor: "#e8dfd0" }}
        >
          {UNITS.map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className="px-4 py-2.5 text-sm font-medium transition-colors capitalize"
              style={{
                background: unit === u ? INK : "white",
                color: unit === u ? "white" : INK,
              }}
            >
              {u}
            </button>
          ))}
        </div>

        {/* End date picker */}
        <div className="relative inline-block">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-white/80"
            style={{ background: "white", borderColor: "#e8dfd0", color: INK }}
          >
            <Calendar size={16} style={{ color: AMBER }} />
            {endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </button>

          {showPicker && (
            <div
              className="absolute z-50 mt-2 rounded-xl border p-3 shadow-xl"
              style={{ background: "white", borderColor: "#e8dfd0" }}
            >
              <DayPicker
                mode="single"
                selected={endDate}
                onSelect={pickEndDate}
                endMonth={new Date()}
                startMonth={new Date(2022, 0)}
                captionLayout="dropdown"
              />
              <button
                onClick={() => { setEndDate(new Date()); setShowPicker(false); }}
                className="mt-2 w-full rounded-lg px-4 py-2 text-xs font-medium text-white"
                style={{ background: SAGE }}
              >
                Reset to Today
              </button>
            </div>
          )}
        </div>

        <p className="text-sm" style={{ color: "#9a8571" }}>
          <span className="font-bold" style={{ color: INK }}>{count} {unitLabel(unit).toLowerCase()}</span> ending {endDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: `${AMBER} transparent ${AMBER} ${AMBER}` }}
          />
        </div>
      )}

      {!loading && data && (
        <>
          {/* Aggregate KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label={`Total Revenue`}
              value={formatCurrency(data.totals.revenue)}
              icon={<IndianRupee size={18} />}
              color={AMBER}
            />
            <KpiCard
              label={`Total Orders`}
              value={data.totals.orders.toLocaleString()}
              icon={<ShoppingBag size={18} />}
              color={SAGE}
            />
            <KpiCard
              label={`Total Customers`}
              value={data.totals.customers.toLocaleString()}
              icon={<Users size={18} />}
              color={ROSE}
            />
            <KpiCard
              label={`Avg Order Value`}
              value={formatCurrency(data.totals.aov)}
              icon={<Gauge size={18} />}
              color={AMBER}
            />
          </div>

          {/* Chart mode toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex rounded-xl border overflow-hidden"
              style={{ borderColor: "#e8dfd0" }}
            >
              {(["revenue", "orders", "customers"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className="px-4 py-2 text-sm font-medium transition-colors capitalize"
                  style={{
                    background: chartMode === m ? INK : "white",
                    color: chartMode === m ? "white" : INK,
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Line chart */}
          <div
            className="rounded-2xl border p-5 shadow-sm"
            style={{ background: "white", borderColor: "#e8dfd0" }}
          >
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={data.periods} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8dfd0" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#9a8571", fontSize: 12 }}
                  axisLine={{ stroke: "#e8dfd0" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#9a8571", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    chartMode === "revenue" ? formatCurrency(v) : v.toLocaleString()
                  }
                />
                <Tooltip content={<ChartTooltip />} />
                {chartMode === "revenue" && (
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke={AMBER} strokeWidth={2.5} dot={{ fill: AMBER, r: 4 }} activeDot={{ r: 6 }} />
                )}
                {chartMode === "orders" && (
                  <>
                    <Line type="monotone" dataKey="orders" name="Orders" stroke={SAGE} strokeWidth={2.5} dot={{ fill: SAGE, r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="cancelledOrders" name="Cancelled" stroke={ROSE} strokeWidth={2} dot={{ fill: ROSE, r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="rtoOrders" name="RTO" stroke="#b5a48e" strokeWidth={2} dot={{ fill: "#b5a48e", r: 3 }} activeDot={{ r: 5 }} />
                  </>
                )}
                {chartMode === "customers" && (
                  <>
                    <Line type="monotone" dataKey="ftCustomers" name="First Timers" stroke={AMBER} strokeWidth={2.5} dot={{ fill: AMBER, r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="repeatCustomers" name="Repeat" stroke={SAGE} strokeWidth={2.5} dot={{ fill: SAGE, r: 4 }} activeDot={{ r: 6 }} />
                  </>
                )}
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "#9a8571" }}
                  iconType="circle"
                  iconSize={8}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Line chart: AOV trend */}
          <div
            className="rounded-2xl border p-5 shadow-sm"
            style={{ background: "white", borderColor: "#e8dfd0" }}
          >
            <p
              className="mb-4 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "#9a8571" }}
            >
              AOV Trend
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.periods} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8dfd0" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#9a8571", fontSize: 12 }}
                  axisLine={{ stroke: "#e8dfd0" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#9a8571", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="aov"
                  name="AOV"
                  stroke={ROSE}
                  strokeWidth={2.5}
                  dot={{ fill: ROSE, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Period breakdown table */}
          <div
            className="rounded-2xl border shadow-sm overflow-hidden"
            style={{ background: "white", borderColor: "#e8dfd0" }}
          >
            <div className="px-5 py-4 border-b" style={{ borderColor: "#e8dfd0" }}>
              <p
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "#9a8571" }}
              >
                Period Breakdown
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "#faf6ef" }}>
                    {["Period", "Revenue", "Orders", "Customers", "AOV", "FT", "Repeat"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: "#9a8571" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.periods.map((p, i) => (
                    <tr
                      key={i}
                      className="border-t"
                      style={{ borderColor: "#f1e7d3" }}
                    >
                      <td className="px-4 py-3 font-medium" style={{ color: INK }}>{p.label}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{formatCurrency(p.revenue)}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{p.orders.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{p.customers.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{formatCurrency(p.aov)}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: AMBER }}>{p.ftCustomers.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: SAGE }}>{p.repeatCustomers.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
