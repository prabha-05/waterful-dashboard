"use client";

import { useEffect, useState } from "react";
import { IndianRupee, Target, ShoppingCart, MousePointerClick, Users } from "lucide-react";
import { PeriodPicker, formatDateParam, type Unit } from "@/components/ui/period-picker";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const CREAM = "#f1e7d3";
const BORDER = "#e8dfd0";

type AdSet = {
  name: string;
  status: string;
  campaignName: string;
  optimizationGoal: string | null;
  dailyBudget: number | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  avgFrequency: number;
  purchases: number;
  purchaseValue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
};

type Data = {
  count: number;
  unit: string;
  window: { from: string; to: string };
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    purchases: number;
    purchaseValue: number;
    ctr: number;
    cpa: number;
    roas: number;
  };
  adSets: AdSet[];
  meta: {
    lastSyncedAt: string | null;
    totalAdSets: number;
    activeAdSets: number;
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
  return `${Math.round(hours / 24)} days ago`;
}

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  tint,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: typeof Users;
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
      {hint && (
        <p className="mt-2 text-xs italic" style={{ color: MUTED }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function MetaAdSets() {
  const [count, setCount] = useState(7);
  const [unit, setUnit] = useState<Unit>("day");
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const [endDate, setEndDate] = useState<Date>(yesterday);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = `count=${count}&unit=${unit}&end=${formatDateParam(endDate)}`;
    fetch(`/api/meta/ad-sets?${qs}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [count, unit, endDate]);

  const picker = (
    <PeriodPicker
      count={count}
      unit={unit}
      endDate={endDate}
      onCountChange={setCount}
      onUnitChange={setUnit}
      onEndDateChange={setEndDate}
    />
  );

  if (loading && !data) {
    return (
      <div className="space-y-6">
        {picker}
        <div className="text-center py-16 text-sm italic" style={{ color: MUTED }}>
          Loading ad sets…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {picker}
        <div className="text-center py-16 text-sm" style={{ color: ROSE }}>
          Couldn&apos;t load ad set data.
        </div>
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-8">
      {/* Picker + sync info */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={loading ? "opacity-50 transition-opacity" : ""}>{picker}</div>
        <div className="text-xs" style={{ color: MUTED }}>
          Last synced: <span className="font-semibold" style={{ color: INK }}>
            {formatRelative(data.meta.lastSyncedAt)}
          </span>
          {" · "}
          {data.meta.activeAdSets} active / {data.meta.totalAdSets} total ad sets
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Spend" value={formatInr(t.spend)} icon={IndianRupee} tint={ROSE} />
        <KpiCard title="ROAS" value={`${t.roas.toFixed(2)}x`} icon={Target} tint={SAGE}
          hint={t.roas < 1 ? "burning money" : t.roas < 2 ? "marginal" : "healthy"} />
        <KpiCard title="CPA" value={formatInr(t.cpa)} icon={ShoppingCart} tint={AMBER} hint="cost per purchase" />
        <KpiCard title="CTR" value={`${t.ctr.toFixed(2)}%`} icon={MousePointerClick} tint="#8b5cf6" />
        <KpiCard title="Purchases" value={formatNumber(t.purchases)} icon={Users} tint={INK} hint="Meta-attributed" />
      </div>

      {/* Ad Set table */}
      <section
        className="rounded-2xl border shadow-sm overflow-hidden"
        style={{ background: "white", borderColor: BORDER }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: BORDER }}>
          <h2 className="text-lg font-semibold" style={{ color: INK }}>
            Ad Sets — Audience Performance
          </h2>
          <p className="text-xs italic mt-1" style={{ color: MUTED }}>
            Each ad set = one audience with its own budget. Compare which audiences buy. Sorted by spend.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#faf6ef" }}>
                {[
                  { label: "Ad Set", align: "left" },
                  { label: "Campaign", align: "left" },
                  { label: "Status", align: "left" },
                  { label: "Spend", align: "right" },
                  { label: "Reach", align: "right" },
                  { label: "Freq", align: "right" },
                  { label: "CTR", align: "right" },
                  { label: "CPC", align: "right" },
                  { label: "Purchases", align: "right" },
                  { label: "CPA", align: "right" },
                  { label: "ROAS", align: "right" },
                ].map((h) => (
                  <th key={h.label}
                    className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: MUTED, textAlign: h.align as "left" | "right" }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.adSets.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center text-sm italic" style={{ color: MUTED }}>
                    No ad set spend in this window. Try a wider date range.
                  </td>
                </tr>
              )}
              {data.adSets.map((a, i) => {
                const roasColor = a.roas >= 2 ? SAGE : a.roas >= 1 ? AMBER : ROSE;
                const freqColor = a.avgFrequency > 3 ? ROSE : a.avgFrequency > 2 ? AMBER : INK;
                return (
                  <tr key={i} className="border-t" style={{ borderColor: CREAM }}>
                    <td className="px-3 py-2.5 font-medium max-w-xs truncate" style={{ color: INK }} title={a.name}>
                      {a.name}
                    </td>
                    <td className="px-3 py-2.5 max-w-xs truncate" style={{ color: MUTED }} title={a.campaignName}>
                      {a.campaignName}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{
                          background: a.status === "ACTIVE" ? `${SAGE}22` : `${MUTED}22`,
                          color: a.status === "ACTIVE" ? SAGE : MUTED,
                        }}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>{formatInr(a.spend)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>{formatNumber(a.reach)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: freqColor }}
                        title={a.avgFrequency > 3 ? "creative fatigue likely" : ""}>
                      {a.avgFrequency.toFixed(1)}x
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>{a.ctr.toFixed(2)}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>{formatInr(a.cpc)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>{a.purchases}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>
                      {a.purchases > 0 ? formatInr(a.cpa) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: roasColor }}>
                      {a.spend > 0 ? `${a.roas.toFixed(2)}x` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
