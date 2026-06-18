"use client";

import { useEffect, useState } from "react";
import { IndianRupee, Target, ShoppingCart, MousePointerClick, Users } from "lucide-react";
import { PeriodPicker, formatDateParam, type Unit } from "@/components/ui/period-picker";

const INK = "#ffffff";
const MUTED = "#94a3b8";
const AMBER = "#f97316";
const SAGE = "#10b981";
const ROSE = "#ef4444";
const CREAM = "#1e293b";
const BORDER = "#1e293b";

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
  budgetSummary: {
    totalDailyBudget: number;
    cbosBudget: number;
    cbosWithBudget: number;
    abosBudget: number;
    abosWithBudget: number;
    yesterdaySpend: number;
    yesterdayDate: string;
    utilization: number;
    headroom: number;
  };
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
      style={{ background: "#0f172a", borderColor: BORDER }}
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

function BudgetHeadroom({
  summary,
}: {
  summary: Data["budgetSummary"];
}) {
  const util = Math.max(0, Math.min(100, summary.utilization));
  // Utilisation colour: under 60% = sage (under-spending), 60-95% = amber
  // (healthy), 95%+ = rose (close to cap)
  const utilColor = util >= 95 ? ROSE : util >= 60 ? AMBER : SAGE;
  const utilHint =
    util >= 95 ? "near cap — algorithm is bidding aggressively"
    : util >= 60 ? "healthy utilisation"
    : "lots of unused headroom";
  return (
    <section
      className="rounded-2xl border p-5 shadow-sm"
      style={{ background: "#0f172a", borderColor: BORDER }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold" style={{ color: INK }}>
          Daily budget headroom
        </h2>
        <span className="text-[11px] italic" style={{ color: MUTED }}>
          comparing yesterday&rsquo;s spend ({summary.yesterdayDate}) to total active daily caps
        </span>
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
            Total daily cap
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: INK }}>
            ₹{summary.totalDailyBudget.toLocaleString("en-IN")}
          </p>
          <p className="mt-1 text-[10px]" style={{ color: MUTED }}>
            {summary.cbosWithBudget} CBO campaign{summary.cbosWithBudget === 1 ? "" : "s"} (₹{summary.cbosBudget.toLocaleString("en-IN")}) + {summary.abosWithBudget} ABO ad set{summary.abosWithBudget === 1 ? "" : "s"} (₹{summary.abosBudget.toLocaleString("en-IN")})
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
            Yesterday&rsquo;s spend
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: INK }}>
            ₹{summary.yesterdaySpend.toLocaleString("en-IN")}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
            Utilisation
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: utilColor }}>
            {util.toFixed(0)}%
          </p>
          <p className="mt-1 text-[10px] italic" style={{ color: MUTED }}>{utilHint}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
            Headroom left
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: INK }}>
            ₹{summary.headroom.toLocaleString("en-IN")}
          </p>
          <p className="mt-1 text-[10px]" style={{ color: MUTED }}>untapped daily capacity</p>
        </div>
      </div>
      {/* Utilisation bar */}
      <div className="mt-4 h-2 w-full rounded-full overflow-hidden" style={{ background: `${MUTED}18` }}>
        <div
          className="h-full transition-all"
          style={{ width: `${util}%`, background: utilColor }}
        />
      </div>
    </section>
  );
}

export function MetaAdSets() {
  const [count, setCount] = useState(7);
  const [unit, setUnit] = useState<Unit>("day");
  // Default: window starting 7 days ago so it covers roughly the same data
  // we used to show with the end-anchored 7-day-ending-yesterday default.
  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 7);
  const [startDate, setStartDate] = useState<Date>(defaultStart);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = `count=${count}&unit=${unit}&start=${formatDateParam(startDate)}`;
    fetch(`/api/meta/ad-sets?${qs}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [count, unit, startDate]);

  const picker = (
    <PeriodPicker
      count={count}
      unit={unit}
      startDate={startDate}
      onCountChange={setCount}
      onUnitChange={setUnit}
      onStartDateChange={setStartDate}
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

      {/* Budget headroom */}
      <BudgetHeadroom summary={data.budgetSummary} />

      {/* Ad Set table */}
      <section
        className="rounded-2xl border shadow-sm overflow-hidden"
        style={{ background: "#0f172a", borderColor: BORDER }}
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
              <tr style={{ background: "#0f172a" }}>
                {[
                  { label: "Ad Set", align: "left" },
                  { label: "Campaign", align: "left" },
                  { label: "Status", align: "left" },
                  { label: "Daily budget", align: "right" },
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
                  <td colSpan={12} className="px-3 py-12 text-center text-sm italic" style={{ color: MUTED }}>
                    No ad set spend in this window. Try a wider date range.
                  </td>
                </tr>
              )}
              {(() => {
                // Window length in days — used to compute per-ad-set budget
                // utilisation: actual spend / (dailyBudget * daysInWindow).
                const daysInWindow = Math.max(
                  1,
                  Math.round(
                    (new Date(data.window.to).getTime() - new Date(data.window.from).getTime()) / 86_400_000,
                  ),
                );
                return data.adSets.map((a, i) => {
                  const roasColor = a.roas >= 2 ? SAGE : a.roas >= 1 ? AMBER : ROSE;
                  const freqColor = a.avgFrequency > 3 ? ROSE : a.avgFrequency > 2 ? AMBER : INK;
                  const budget = a.dailyBudget ? Number(a.dailyBudget) : 0;
                  const utilPct = budget > 0 ? (a.spend / (budget * daysInWindow)) * 100 : null;
                  const utilColor =
                    utilPct == null ? MUTED
                    : utilPct >= 95 ? ROSE
                    : utilPct >= 60 ? AMBER
                    : SAGE;
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
                    <td
                      className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap"
                      style={{ color: INK }}
                      title={budget > 0 ? `${utilPct?.toFixed(0)}% of cap used over ${daysInWindow}d` : "no daily budget set"}
                    >
                      {budget > 0 ? (
                        <>
                          {formatInr(budget)}
                          <span className="ml-2 text-[11px] font-semibold" style={{ color: utilColor }}>
                            {utilPct!.toFixed(0)}%
                          </span>
                        </>
                      ) : (
                        <span style={{ color: MUTED }}>—</span>
                      )}
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
                });
              })()}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
