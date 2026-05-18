"use client";

import { useEffect, useMemo, useState } from "react";
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
  TrendingUp,
  TrendingDown,
  IndianRupee,
  ShoppingCart,
  MousePointerClick,
  Target,
  Activity,
  Calendar,
} from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const CREAM = "#f1e7d3";
const CREAM_BG = "#faf6ef";
const BORDER = "#e8dfd0";

function formatDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayYmd() {
  return formatDateParam(new Date());
}
function shiftYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromYmd: string, toYmd: string) {
  const f = new Date(`${fromYmd}T00:00:00Z`);
  const t = new Date(`${toYmd}T00:00:00Z`);
  return Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
}

type Period = {
  label: string;
  from: string;
  to: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  purchaseValue: number;
};

type CampaignRow = {
  name: string;
  status: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  purchaseValue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
};

type Overview = {
  count: number;
  unit: string;
  periods: Period[];
  totals: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    purchases: number;
    purchaseValue: number;
  };
  previousTotals: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    purchases: number;
    purchaseValue: number;
  };
  campaigns: CampaignRow[];
  meta: {
    lastSyncedAt: string | null;
    totalCampaigns: number;
    activeCampaigns: number;
  };
};

function formatInr(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function formatNumber(v: number) {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString("en-IN");
}

function formatRelative(iso: string | null) {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function KpiCard({
  title,
  value,
  delta,
  invertDelta,
  icon: Icon,
  tint,
  hint,
}: {
  title: string;
  value: string;
  delta?: number | null;
  invertDelta?: boolean;
  icon: typeof Activity;
  tint: string;
  hint?: string;
}) {
  const isPositive = delta !== null && delta !== undefined && delta > 0;
  const isNegative = delta !== null && delta !== undefined && delta < 0;
  // For invertDelta=true (e.g. CPA, where lower is better), flip the color logic
  const goodGreen = invertDelta ? isNegative : isPositive;
  const badRose = invertDelta ? isPositive : isNegative;

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
      <div className="mt-2 flex items-center gap-2">
        {delta !== null && delta !== undefined && (
          <span
            className="flex items-center gap-1 text-xs font-semibold tabular-nums"
            style={{ color: goodGreen ? SAGE : badRose ? ROSE : MUTED }}
          >
            {isPositive ? <TrendingUp size={12} /> : isNegative ? <TrendingDown size={12} /> : null}
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        )}
        {hint && (
          <span className="text-xs italic" style={{ color: MUTED }}>
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

function FunnelStage({
  label,
  count,
  rateFromPrev,
  color,
}: {
  label: string;
  count: number;
  rateFromPrev?: number;
  color: string;
}) {
  return (
    <div className="flex-1">
      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color: INK }}>
        {formatNumber(count)}
      </div>
      {rateFromPrev !== undefined && (
        <div className="mt-1 text-xs tabular-nums" style={{ color }}>
          {rateFromPrev.toFixed(2)}% conversion
        </div>
      )}
    </div>
  );
}

export function MetaOverview() {
  // Default: last 7 days ending yesterday (IST)
  const yesterday = shiftYmd(todayYmd(), -1);
  const sevenAgo = shiftYmd(yesterday, -6);

  const [from, setFrom] = useState(sevenAgo);
  const [to, setTo] = useState(yesterday);
  const [activeOnly, setActiveOnly] = useState(false);
  const [search, setSearch] = useState("");

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  // Convert from/to → count + unit=day + start for the existing API
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const count = daysBetween(from, to);
    const qs = `count=${count}&unit=day&start=${from}`;
    fetch(`/api/meta/overview?${qs}`)
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
  }, [from, to]);

  // Client-side filter for the campaigns table — name search + active-only.
  // Health keywords mirror the Meta Ads page so this looks/feels the same.
  const filteredCampaigns = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const isPerforming = /performing|^top$|top |winning/.test(q);
    const isLosing = /losing|killer|^bad$|bad /.test(q);
    return data.campaigns.filter((c) => {
      if (activeOnly && c.status !== "ACTIVE") return false;
      if (!q) return true;
      if (isPerforming) return c.roas >= 2;
      if (isLosing) return c.roas < 1 && c.spend > 1000;
      return c.name.toLowerCase().includes(q);
    });
  }, [data, activeOnly, search]);

  const picker = (
    <div
      className="flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm"
      style={{ background: "white", borderColor: BORDER }}
    >
      <div className="flex items-center gap-2">
        <Calendar size={14} style={{ color: AMBER }} />
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>From</label>
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
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>To</label>
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
        onClick={() => setActiveOnly((v) => !v)}
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors"
        style={{
          borderColor: BORDER,
          background: activeOnly ? `${SAGE}22` : CREAM_BG,
          color: activeOnly ? SAGE : MUTED,
        }}
        title="Show only campaigns with status = ACTIVE"
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: activeOnly ? SAGE : MUTED }}
        />
        Active only
      </button>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name / performing / losing"
          className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          style={{ borderColor: BORDER, color: INK, background: CREAM_BG, width: 200 }}
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-xs" style={{ color: MUTED }} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>
      <span className="ml-auto text-xs" style={{ color: MUTED }}>
        {data ? (
          <>
            <span className="font-bold" style={{ color: INK }}>{filteredCampaigns.length}</span>
            {(activeOnly || search) ? " of " : " "}
            {(activeOnly || search) && (
              <span className="font-semibold" style={{ color: INK }}>{data.campaigns.length}</span>
            )}
            {(activeOnly || search) ? " campaigns" : "campaigns"}
          </>
        ) : "—"}
      </span>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="space-y-6">
        {picker}
        <div className="text-center py-16 text-sm italic" style={{ color: MUTED }}>
          Loading Meta ad performance…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {picker}
        <div className="text-center py-16 text-sm" style={{ color: ROSE }}>
          Couldn&apos;t load Meta data. Try syncing first.
        </div>
      </div>
    );
  }

  // Derived metrics for current window
  const t = data.totals;
  const p = data.previousTotals;
  const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  const prevCtr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0;
  const cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
  const cpa = t.purchases > 0 ? t.spend / t.purchases : 0;
  const prevCpa = p.purchases > 0 ? p.spend / p.purchases : 0;
  const roas = t.spend > 0 ? t.purchaseValue / t.spend : 0;
  const prevRoas = p.spend > 0 ? p.purchaseValue / p.spend : 0;

  // Funnel rates
  const clickRate = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  const purchaseRate = t.clicks > 0 ? (t.purchases / t.clicks) * 100 : 0;

  return (
    <div className="space-y-8">
      {/* Period picker + last synced */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={loading ? "opacity-50 transition-opacity" : ""}>{picker}</div>
        <div className="text-xs" style={{ color: MUTED }}>
          Last synced: <span className="font-semibold" style={{ color: INK }}>
            {formatRelative(data.meta.lastSyncedAt)}
          </span>
          {" · "}
          {data.meta.activeCampaigns} active / {data.meta.totalCampaigns} total campaigns
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title="Spend"
          value={formatInr(t.spend)}
          delta={deltaPct(t.spend, p.spend)}
          invertDelta
          icon={IndianRupee}
          tint={ROSE}
          hint="vs prev"
        />
        <KpiCard
          title="ROAS"
          value={`${roas.toFixed(2)}x`}
          delta={deltaPct(roas, prevRoas)}
          icon={Target}
          tint={SAGE}
          hint={roas < 1 ? "burning money" : roas < 2 ? "marginal" : "healthy"}
        />
        <KpiCard
          title="CPA"
          value={formatInr(cpa)}
          delta={deltaPct(cpa, prevCpa)}
          invertDelta
          icon={ShoppingCart}
          tint={AMBER}
          hint="cost per purchase"
        />
        <KpiCard
          title="CTR"
          value={`${ctr.toFixed(2)}%`}
          delta={deltaPct(ctr, prevCtr)}
          icon={MousePointerClick}
          tint="#8b5cf6"
          hint="click-through rate"
        />
        <KpiCard
          title="Purchases"
          value={formatNumber(t.purchases)}
          delta={deltaPct(t.purchases, p.purchases)}
          icon={Activity}
          tint={INK}
          hint="Meta-attributed"
        />
      </div>

      {/* Daily Spend Trend */}
      <section
        className="rounded-2xl border p-5 shadow-sm"
        style={{ background: "white", borderColor: BORDER }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold" style={{ color: INK }}>
            Spend Trend
          </h2>
          <p className="text-xs italic" style={{ color: MUTED }}>
            ₹ spent per day
          </p>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.periods} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CREAM} />
            <XAxis
              dataKey="label"
              tick={{ fill: INK, fontSize: 11 }}
              axisLine={{ stroke: CREAM }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: MUTED, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatInr(v)}
              width={60}
            />
            <Tooltip
              formatter={(v: any) => [formatInr(Number(v)), "Spend"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CREAM}` }}
            />
            <Line
              type="monotone"
              dataKey="spend"
              stroke={ROSE}
              strokeWidth={2.5}
              dot={{ fill: ROSE, r: 3 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Funnel */}
      <section
        className="rounded-2xl border p-5 shadow-sm"
        style={{ background: "white", borderColor: BORDER }}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold" style={{ color: INK }}>
            Acquisition Funnel
          </h2>
          <p className="text-xs italic" style={{ color: MUTED }}>
            How many drop off between each step
          </p>
        </div>
        <div className="flex items-stretch gap-4 overflow-x-auto">
          <FunnelStage label="Impressions" count={t.impressions} color={MUTED} />
          <div className="flex items-center text-2xl" style={{ color: MUTED }}>
            →
          </div>
          <FunnelStage
            label="Clicks"
            count={t.clicks}
            rateFromPrev={clickRate}
            color={SAGE}
          />
          <div className="flex items-center text-2xl" style={{ color: MUTED }}>
            →
          </div>
          <FunnelStage
            label="Purchases"
            count={t.purchases}
            rateFromPrev={purchaseRate}
            color={SAGE}
          />
        </div>
      </section>

      {/* Campaign Table */}
      <section
        className="rounded-2xl border shadow-sm overflow-hidden"
        style={{ background: "white", borderColor: BORDER }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: BORDER }}>
          <h2 className="text-lg font-semibold" style={{ color: INK }}>
            Campaign Performance
          </h2>
          <p className="text-xs italic mt-1" style={{ color: MUTED }}>
            Sorted by spend (highest first). Empty cells mean no spend in this window.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#faf6ef" }}>
                {[
                  { label: "Campaign", align: "left" },
                  { label: "Status", align: "left" },
                  { label: "Spend", align: "right" },
                  { label: "CTR", align: "right" },
                  { label: "CPC", align: "right" },
                  { label: "Purchases", align: "right" },
                  { label: "Revenue", align: "right" },
                  { label: "CPA", align: "right" },
                  { label: "ROAS", align: "right" },
                ].map((h) => (
                  <th
                    key={h.label}
                    className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: MUTED, textAlign: h.align as "left" | "right" }}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-sm italic" style={{ color: MUTED }}>
                    {data.campaigns.length === 0
                      ? "No campaigns with spend in this window. Try a wider date range."
                      : "No campaigns match the current filters. Try clearing search or turning off 'Active only'."}
                  </td>
                </tr>
              )}
              {filteredCampaigns.map((c, i) => {
                const roasColor =
                  c.roas >= 2 ? SAGE : c.roas >= 1 ? AMBER : ROSE;
                return (
                  <tr key={i} className="border-t" style={{ borderColor: CREAM }}>
                    <td className="px-3 py-2.5 font-medium max-w-md truncate" style={{ color: INK }} title={c.name}>
                      {c.name}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{
                          background: c.status === "ACTIVE" ? `${SAGE}22` : `${MUTED}22`,
                          color: c.status === "ACTIVE" ? SAGE : MUTED,
                        }}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>
                      {formatInr(c.spend)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>
                      {c.ctr.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>
                      {formatInr(c.cpc)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>
                      {c.purchases}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>
                      {formatInr(c.purchaseValue)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>
                      {c.purchases > 0 ? formatInr(c.cpa) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: roasColor }}>
                      {c.spend > 0 ? `${c.roas.toFixed(2)}x` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Health flag */}
      {roas > 0 && roas < 1 && (
        <div
          className="rounded-xl border p-4 flex items-start gap-3"
          style={{ borderColor: `${ROSE}55`, background: `${ROSE}10`, color: ROSE }}
        >
          <TrendingDown size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">⚠ ROAS below 1x — losing money on Meta ads</p>
            <p className="mt-0.5" style={{ color: INK }}>
              You&apos;re spending more than you&apos;re earning back per Meta&apos;s attribution.
              Consider reviewing creative or audience targeting. (Note: Meta&apos;s attribution
              is conservative — true ROAS may be higher when matched against actual Shopify orders.)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
