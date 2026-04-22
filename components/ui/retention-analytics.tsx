"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingDown,
  Zap,
  Clock,
  Repeat,
} from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const CREAM = "#f1e7d3";
const CREAM_BG = "#faf6ef";
const BORDER = "#e8dfd0";

type ChurnPoint = { month: string; label: string; active: number; retention: number; churn: number };
type WinBackPoint = { month: string; label: string; dormantBase: number; wonBack: number; rate: number };
type Bucket = { label: string; min: number; max: number; count: number };
type FlavourStat = { flavour: string; total: number; repeat: number; rate: number };
type StateStat = { state: string; total: number; repeat: number; rate: number };
type CohortMonth = { offset: number; count: number; pct: number };
type CohortRow = { cohort: string; label: string; size: number; months: CohortMonth[] };

type Analytics = {
  totalCustomers: number;
  churnRate: number;
  churnThresholdDays: number;
  churnTrend: ChurnPoint[];
  winBackMonthly: WinBackPoint[];
  timeTo2ndBuckets: Bucket[];
  timeTo2ndMedian: number;
  replenBuckets: Bucket[];
  replenMedian: number;
  byFlavour: FlavourStat[];
  byState: StateStat[];
  cohortMatrix: CohortRow[];
  maxCohortOffset: number;
};

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  tint,
}: {
  title: string;
  value: string;
  sub: string;
  icon: typeof TrendingDown;
  tint: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5 shadow-sm"
      style={{ background: "white", borderColor: BORDER }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          {title}
        </p>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ background: `${tint}22`, color: tint }}
        >
          <Icon size={14} />
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold tabular-nums" style={{ color: INK }}>
        {value}
      </p>
      <p className="mt-2 text-xs" style={{ color: MUTED }}>
        {sub}
      </p>
    </div>
  );
}

function cohortCellColor(pct: number) {
  // interpolate from cream (0%) → sage (100%)
  const opacity = Math.min(1, pct / 100);
  return `rgba(122, 148, 113, ${opacity})`;
}

function cohortCellTextColor(pct: number) {
  return pct > 45 ? "white" : INK;
}

function formatInt(n: number) {
  return n.toLocaleString("en-IN");
}

export function RetentionAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/retention/analytics")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="text-center py-16 text-sm italic" style={{ color: MUTED }}>
        Crunching every order in your history…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-sm" style={{ color: ROSE }}>
        Couldn&apos;t load retention analytics. Try again in a moment.
      </div>
    );
  }

  const latestChurn = data.churnTrend[data.churnTrend.length - 1];
  const latestWinBack = data.winBackMonthly[data.winBackMonthly.length - 1];
  const maxOffsetShown = Math.max(
    0,
    ...data.cohortMatrix.map((c) => c.months.length - 1),
  );

  return (
    <div className="space-y-8">
      {/* Top KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Churn Rate"
          value={`${data.churnRate.toFixed(1)}%`}
          sub={`Customers silent ${data.churnThresholdDays}+ days / all customers`}
          icon={TrendingDown}
          tint={ROSE}
        />
        <KpiCard
          title="MoM Retention"
          value={`${latestChurn?.retention.toFixed(1) ?? "0"}%`}
          sub={`${latestChurn?.label ?? ""} — how many of last month's buyers returned`}
          icon={Repeat}
          tint={SAGE}
        />
        <KpiCard
          title="Win-Back Rate"
          value={`${latestWinBack?.rate.toFixed(1) ?? "0"}%`}
          sub={`${latestWinBack?.label ?? ""} — dormant customers who reordered`}
          icon={Zap}
          tint={AMBER}
        />
        <KpiCard
          title="Replenishment"
          value={`${Math.round(data.replenMedian)} d`}
          sub="Median days between a customer's consecutive orders"
          icon={Clock}
          tint="#8b5cf6"
        />
      </div>

      {/* Cohort Heatmap */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: INK }}>
            Cohort Retention Heatmap
          </h2>
          <p className="text-xs italic" style={{ color: MUTED }}>
            % of each cohort that ordered in month N after acquisition
          </p>
        </div>
        <div
          className="rounded-2xl border overflow-x-auto shadow-sm"
          style={{ background: "white", borderColor: BORDER }}
        >
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: CREAM_BG }}>
                <th
                  className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider whitespace-nowrap sticky left-0 z-10"
                  style={{ color: MUTED, background: CREAM_BG, minWidth: 110 }}
                >
                  Cohort
                </th>
                <th
                  className="px-2 py-2.5 text-right font-semibold uppercase tracking-wider"
                  style={{ color: MUTED }}
                >
                  Size
                </th>
                {Array.from({ length: maxOffsetShown + 1 }).map((_, i) => (
                  <th
                    key={i}
                    className="px-2 py-2.5 text-center font-semibold uppercase tracking-wider"
                    style={{ color: MUTED, minWidth: 54 }}
                  >
                    M{i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cohortMatrix.map((row) => (
                <tr key={row.cohort} className="border-t" style={{ borderColor: CREAM }}>
                  <td
                    className="px-3 py-2 font-medium whitespace-nowrap sticky left-0"
                    style={{ color: INK, background: "white" }}
                  >
                    {row.label}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: INK }}>
                    {formatInt(row.size)}
                  </td>
                  {Array.from({ length: maxOffsetShown + 1 }).map((_, i) => {
                    const cell = row.months[i];
                    if (!cell) {
                      return <td key={i} className="px-2 py-2" style={{ background: "#fafafa" }} />;
                    }
                    return (
                      <td
                        key={i}
                        className="px-2 py-2 text-center font-semibold tabular-nums"
                        style={{
                          background: cohortCellColor(cell.pct),
                          color: cohortCellTextColor(cell.pct),
                        }}
                        title={`${cell.count} of ${row.size} (${cell.pct.toFixed(1)}%)`}
                      >
                        {cell.pct > 0 ? `${cell.pct.toFixed(0)}%` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs italic" style={{ color: MUTED }}>
          Read a row left → right: how a single cohort thins out over time. Compare rows to see if
          newer cohorts retain better than older ones.
        </p>
      </section>

      {/* Monthly Retention Trend + Win-Back Trend */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div
          className="rounded-2xl border p-5 shadow-sm"
          style={{ background: "white", borderColor: BORDER }}
        >
          <h3 className="text-sm font-semibold mb-1" style={{ color: INK }}>
            Monthly Retention Trend
          </h3>
          <p className="text-xs italic mb-3" style={{ color: MUTED }}>
            % of last month's buyers who ordered again this month
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.churnTrend.slice(1)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CREAM} />
              <XAxis
                dataKey="label"
                tick={{ fill: INK, fontSize: 11 }}
                axisLine={{ stroke: CREAM }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                width={38}
              />
              <Tooltip
                formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Retention"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CREAM}` }}
              />
              <Line
                type="monotone"
                dataKey="retention"
                stroke={SAGE}
                strokeWidth={2.5}
                dot={{ fill: SAGE, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div
          className="rounded-2xl border p-5 shadow-sm"
          style={{ background: "white", borderColor: BORDER }}
        >
          <h3 className="text-sm font-semibold mb-1" style={{ color: INK }}>
            Win-Back Rate (monthly)
          </h3>
          <p className="text-xs italic mb-3" style={{ color: MUTED }}>
            % of dormant (90+ days silent) customers who reordered
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.winBackMonthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CREAM} />
              <XAxis
                dataKey="label"
                tick={{ fill: INK, fontSize: 11 }}
                axisLine={{ stroke: CREAM }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                width={38}
              />
              <Tooltip
                formatter={(v: any, _n: any, p: any) => [
                  `${Number(v).toFixed(1)}% (${p.payload.wonBack}/${p.payload.dormantBase})`,
                  "Won back",
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CREAM}` }}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke={AMBER}
                strokeWidth={2.5}
                dot={{ fill: AMBER, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Time to 2nd + Replenishment distributions */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div
          className="rounded-2xl border p-5 shadow-sm"
          style={{ background: "white", borderColor: BORDER }}
        >
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="text-sm font-semibold" style={{ color: INK }}>
              Time to 2nd Order
            </h3>
            <span className="text-xs tabular-nums" style={{ color: MUTED }}>
              median: <span className="font-semibold" style={{ color: INK }}>
                {Math.round(data.timeTo2ndMedian)} d
              </span>
            </span>
          </div>
          <p className="text-xs italic mb-3" style={{ color: MUTED }}>
            The habit-formation window — long tails = win-back opportunity
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.timeTo2ndBuckets} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CREAM} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: INK, fontSize: 11 }}
                axisLine={{ stroke: CREAM }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip
                formatter={(v: any) => [formatInt(Number(v)), "Customers"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CREAM}` }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={SAGE} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          className="rounded-2xl border p-5 shadow-sm"
          style={{ background: "white", borderColor: BORDER }}
        >
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="text-sm font-semibold" style={{ color: INK }}>
              Replenishment Cycle
            </h3>
            <span className="text-xs tabular-nums" style={{ color: MUTED }}>
              median: <span className="font-semibold" style={{ color: INK }}>
                {Math.round(data.replenMedian)} d
              </span>
            </span>
          </div>
          <p className="text-xs italic mb-3" style={{ color: MUTED }}>
            Days between a customer's consecutive orders — your natural reorder cadence
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.replenBuckets} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CREAM} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: INK, fontSize: 11 }}
                axisLine={{ stroke: CREAM }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip
                formatter={(v: any) => [formatInt(Number(v)), "Order gaps"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CREAM}` }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={AMBER} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Retention by flavour + state */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div
          className="rounded-2xl border p-5 shadow-sm"
          style={{ background: "white", borderColor: BORDER }}
        >
          <h3 className="text-sm font-semibold mb-1" style={{ color: INK }}>
            Retention by First Product
          </h3>
          <p className="text-xs italic mb-3" style={{ color: MUTED }}>
            Which flavour brings in the stickiest customers?
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: CREAM_BG }}>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                    Flavour
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                    Customers
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                    Returned
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                    Retention
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byFlavour.map((r) => (
                  <tr key={r.flavour} className="border-t" style={{ borderColor: CREAM }}>
                    <td className="px-3 py-2 font-medium" style={{ color: INK }}>
                      {r.flavour}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: INK }}>
                      {formatInt(r.total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: INK }}>
                      {formatInt(r.repeat)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: SAGE }}>
                      {r.rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {data.byFlavour.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-xs italic" style={{ color: MUTED }}>
                      No flavour data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="rounded-2xl border p-5 shadow-sm"
          style={{ background: "white", borderColor: BORDER }}
        >
          <h3 className="text-sm font-semibold mb-1" style={{ color: INK }}>
            Retention by State
          </h3>
          <p className="text-xs italic mb-3" style={{ color: MUTED }}>
            Top 15 states by customer count (states with &lt;5 hidden)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: CREAM_BG }}>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                    State
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                    Customers
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                    Returned
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                    Retention
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byState.map((r) => (
                  <tr key={r.state} className="border-t" style={{ borderColor: CREAM }}>
                    <td className="px-3 py-2 font-medium" style={{ color: INK }}>
                      {r.state}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: INK }}>
                      {formatInt(r.total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: INK }}>
                      {formatInt(r.repeat)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: SAGE }}>
                      {r.rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {data.byState.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-xs italic" style={{ color: MUTED }}>
                      No state data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
