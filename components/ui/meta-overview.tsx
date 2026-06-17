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

const INK = "#ffffff";
const MUTED = "#9ca3af";
const AMBER = "#22c5ff";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const CREAM = "#f1e7d3";
const CREAM_BG = "#0a0a0a";
const BORDER = "#1a1a1a";

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

type LevelRow = {
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  purchaseValue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  frequency: number;
};

type AdRow = LevelRow;
type AdSetRow = LevelRow & { ads: AdRow[] };
type CampaignRow = LevelRow & {
  metaCampaignId: string;
  objective: string | null;
  adSets: AdSetRow[];
};

type Overview = {
  count: number;
  unit: string;
  periods: Period[];
  periodsByCampaign: Record<string, Period[]>;
  totals: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    addToCart: number;
    initiateCheckout: number;
    purchases: number;
    purchaseValue: number;
  };
  previousTotals: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    addToCart: number;
    initiateCheckout: number;
    purchases: number;
    purchaseValue: number;
  };
  previousTotalsByCampaign: Record<
    string,
    {
      spend: number;
      impressions: number;
      reach: number;
      clicks: number;
      addToCart: number;
      initiateCheckout: number;
      purchases: number;
      purchaseValue: number;
    }
  >;
  campaigns: CampaignRow[];
  shopifyReality: {
    orders: number;
    revenue: number;
  };
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

function formatNumber(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "0";
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
      style={{ background: "#0a0a0a", borderColor: BORDER }}
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
  benchmark,
}: {
  label: string;
  count: number;
  rateFromPrev?: number;
  color: string;
  // good ≥ good%, decent ≥ decent%, else poor. Industry benchmark for this rate.
  benchmark?: { good: number; decent: number };
}) {
  const quality =
    rateFromPrev !== undefined && benchmark
      ? rateFromPrev >= benchmark.good
        ? { label: "Good", color: SAGE }
        : rateFromPrev >= benchmark.decent
        ? { label: "Decent", color: AMBER }
        : { label: "Poor", color: ROSE }
      : null;

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
      {quality && benchmark && (
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none"
            style={{ background: `${quality.color}22`, color: quality.color }}
          >
            {quality.label}
          </span>
          <span className="text-[9px]" style={{ color: MUTED }}>
            std: ≥{benchmark.good}% good · ≥{benchmark.decent}% ok
          </span>
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
  // "ALL" or a specific campaign name. Filters KPIs, chart, and funnel.
  const [selectedCampaign, setSelectedCampaign] = useState<string>("ALL");

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

  // Dropdown filters the campaigns table to "All" or one specific campaign.
  const filteredCampaigns = useMemo(() => {
    if (!data) return [];
    if (selectedCampaign === "ALL") return data.campaigns;
    return data.campaigns.filter((c) => c.name === selectedCampaign);
  }, [data, selectedCampaign]);

  // Sorted campaign names for the dropdown (alpha)
  const campaignOptions = useMemo(() => {
    if (!data) return [] as string[];
    return [...data.campaigns.map((c) => c.name)].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const picker = (
    <div
      className="flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm"
      style={{ background: "#0a0a0a", borderColor: BORDER }}
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
      <div className="flex items-center gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Campaign</label>
        <select
          value={selectedCampaign}
          onChange={(e) => setSelectedCampaign(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400 max-w-xs"
          style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
        >
          <option value="ALL">All campaigns</option>
          {campaignOptions.map((name) => (
            <option key={name} value={name}>
              {name.length > 60 ? name.slice(0, 60) + "…" : name}
            </option>
          ))}
        </select>
      </div>
      <span className="ml-auto text-xs" style={{ color: MUTED }}>
        {data ? (
          <>
            <span className="font-bold" style={{ color: INK }}>{filteredCampaigns.length}</span>
            {selectedCampaign !== "ALL" && (
              <>
                {" of "}
                <span className="font-semibold" style={{ color: INK }}>{data.campaigns.length}</span>
              </>
            )}
            {" campaigns"}
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

  // Derived metrics for current window.
  // If a single campaign is selected, use its numbers (current + previous).
  const oneCampaign =
    selectedCampaign !== "ALL"
      ? data.campaigns.find((c) => c.name === selectedCampaign)
      : null;
  const p = oneCampaign
    ? data.previousTotalsByCampaign[selectedCampaign] ?? {
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        addToCart: 0,
        initiateCheckout: 0,
        purchases: 0,
        purchaseValue: 0,
      }
    : data.previousTotals;
  const t = oneCampaign
    ? {
        spend: oneCampaign.spend,
        impressions: oneCampaign.impressions,
        reach: 0, // not tracked per-campaign in current API
        clicks: oneCampaign.clicks,
        addToCart: oneCampaign.addToCart,
        initiateCheckout: oneCampaign.initiateCheckout,
        purchases: oneCampaign.purchases,
        purchaseValue: oneCampaign.purchaseValue,
      }
    : data.totals;
  const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  const prevCtr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0;
  const cpa = t.purchases > 0 ? t.spend / t.purchases : 0;
  const prevCpa = p.purchases > 0 ? p.spend / p.purchases : 0;
  const roas = t.spend > 0 ? t.purchaseValue / t.spend : 0;
  const prevRoas = p.spend > 0 ? p.purchaseValue / p.spend : 0;
  // Always show deltas — API returns per-campaign previous totals too.
  const showDelta = true;

  // Funnel rates
  const clickRate = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  const atcRate = t.clicks > 0 ? (t.addToCart / t.clicks) * 100 : 0;
  const checkoutRate = t.addToCart > 0 ? (t.initiateCheckout / t.addToCart) * 100 : 0;
  const purchaseRate = t.initiateCheckout > 0 ? (t.purchases / t.initiateCheckout) * 100 : 0;

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

      {/* KPI Strip — ordered: Spend → Purchases → Purchase Value → ROAS → CPA → CTR */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          title="Spend"
          value={formatInr(t.spend)}
          delta={showDelta ? deltaPct(t.spend, p.spend) : null}
          invertDelta
          icon={IndianRupee}
          tint={ROSE}
          hint="vs prev"
        />
        <KpiCard
          title="Purchases"
          value={formatNumber(t.purchases)}
          delta={showDelta ? deltaPct(t.purchases, p.purchases) : null}
          icon={Activity}
          tint={INK}
          hint="Meta-attributed"
        />
        <KpiCard
          title="Purchase Value"
          value={formatInr(t.purchaseValue)}
          delta={showDelta ? deltaPct(t.purchaseValue, p.purchaseValue) : null}
          icon={IndianRupee}
          tint={SAGE}
          hint="revenue from ads"
        />
        <KpiCard
          title="ROAS"
          value={`${roas.toFixed(2)}x`}
          delta={showDelta ? deltaPct(roas, prevRoas) : null}
          icon={Target}
          tint={SAGE}
          hint={roas < 1 ? "burning money" : roas < 2 ? "marginal" : "healthy"}
        />
        <KpiCard
          title="CPA"
          value={formatInr(cpa)}
          delta={showDelta ? deltaPct(cpa, prevCpa) : null}
          invertDelta
          icon={ShoppingCart}
          tint={AMBER}
          hint="cost per purchase"
        />
        <KpiCard
          title="CTR"
          value={`${ctr.toFixed(2)}%`}
          delta={showDelta ? deltaPct(ctr, prevCtr) : null}
          icon={MousePointerClick}
          tint="#8b5cf6"
          hint="click-through rate"
        />
      </div>

      {/* Daily Spend Trend */}
      <section
        className="rounded-2xl border p-5 shadow-sm"
        style={{ background: "#0a0a0a", borderColor: BORDER }}
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
          <LineChart
            data={
              selectedCampaign === "ALL"
                ? data.periods
                : data.periodsByCampaign[selectedCampaign] ?? data.periods
            }
            margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          >
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

      {/* Reality Check — Meta vs Shopify */}
      {(() => {
        // Only show when "All campaigns" is selected — Shopify reality is
        // account-wide, not splittable by campaign.
        if (selectedCampaign !== "ALL") return null;
        const metaRev = data.totals.purchaseValue;
        const realRev = data.shopifyReality.revenue;
        const metaRoas = data.totals.spend > 0 ? metaRev / data.totals.spend : 0;
        const blendedRoas = data.totals.spend > 0 ? realRev / data.totals.spend : 0;
        const gap = realRev - metaRev;
        const gapPct = realRev > 0 ? ((realRev - metaRev) / realRev) * 100 : 0;
        const metaShare = realRev > 0 ? (metaRev / realRev) * 100 : 0;
        return (
          <section
            className="rounded-2xl border p-5 shadow-sm"
            style={{ background: "#0a0a0a", borderColor: BORDER }}
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold" style={{ color: INK }}>
                Reality check — Meta vs Shopify
              </h2>
              <p className="text-xs italic" style={{ color: MUTED }}>
                Meta&apos;s Pixel undercounts; Shopify is ground truth.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border p-4" style={{ borderColor: BORDER, background: "#fafaf7" }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>Meta-reported revenue</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{formatInr(metaRev)}</p>
                <p className="text-[11px] mt-1" style={{ color: MUTED }}>from {data.totals.purchases} Pixel-attributed purchases</p>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: `${SAGE}55`, background: `${SAGE}10` }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>Shopify actual revenue</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{formatInr(realRev)}</p>
                <p className="text-[11px] mt-1" style={{ color: MUTED }}>from {data.shopifyReality.orders} net orders</p>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: BORDER, background: "#fafaf7" }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>Meta ROAS (reported)</p>
                <p
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: metaRoas >= 2 ? SAGE : metaRoas >= 1 ? AMBER : ROSE }}
                >
                  {metaRoas.toFixed(2)}x
                </p>
                <p className="text-[11px] mt-1" style={{ color: MUTED }}>Meta&apos;s view — undercount</p>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: `${SAGE}55`, background: `${SAGE}10` }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>Blended ROAS (Shopify)</p>
                <p
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: blendedRoas >= 2 ? SAGE : blendedRoas >= 1 ? AMBER : ROSE }}
                >
                  {blendedRoas.toFixed(2)}x
                </p>
                <p className="text-[11px] mt-1" style={{ color: MUTED }}>all Shopify revenue ÷ Meta spend</p>
              </div>
            </div>
            <div
              className="mt-4 rounded-xl border p-3 flex flex-wrap items-center gap-3 text-[12px]"
              style={{ background: `${AMBER}10`, borderColor: `${AMBER}55`, color: INK }}
            >
              <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap" style={{ background: `${AMBER}33`, color: AMBER }}>
                Pixel undercount: {formatInr(gap)} ({gapPct.toFixed(0)}%)
              </span>
              <span style={{ color: MUTED }}>
                Meta sees <span className="font-semibold" style={{ color: INK }}>{metaShare.toFixed(0)}%</span> of Shopify revenue.
                The other <span className="font-semibold" style={{ color: INK }}>{(100 - metaShare).toFixed(0)}%</span> is direct, retention, or Pixel-missed conversions.
              </span>
              <span className="ml-auto text-[10px]" style={{ color: MUTED }}>
                Enable CAPI to close this gap.
              </span>
            </div>
          </section>
        );
      })()}

      {/* Funnel */}
      <section
        className="rounded-2xl border p-5 shadow-sm"
        style={{ background: "#0a0a0a", borderColor: BORDER }}
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
            benchmark={{ good: 2, decent: 1 }}
          />
          <div className="flex items-center text-2xl" style={{ color: MUTED }}>
            →
          </div>
          <FunnelStage
            label="Add to Cart"
            count={t.addToCart}
            rateFromPrev={atcRate}
            color={SAGE}
            benchmark={{ good: 10, decent: 5 }}
          />
          <div className="flex items-center text-2xl" style={{ color: MUTED }}>
            →
          </div>
          <FunnelStage
            label="Checkout"
            count={t.initiateCheckout}
            rateFromPrev={checkoutRate}
            color={SAGE}
            benchmark={{ good: 70, decent: 50 }}
          />
          <div className="flex items-center text-2xl" style={{ color: MUTED }}>
            →
          </div>
          <FunnelStage
            label="Purchases"
            count={t.purchases}
            rateFromPrev={purchaseRate}
            color={SAGE}
            benchmark={{ good: 70, decent: 50 }}
          />
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
