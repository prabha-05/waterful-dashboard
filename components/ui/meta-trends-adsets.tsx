"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, FolderTree, ChevronRight } from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const BORDER = "#e7d9c1";
const BLUE = "#7c8bb2";
const CREAM_BG = "#faf6ef";

function formatInr(v: number) {
  if (v >= 100000) return `Rs.${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `Rs.${(v / 1000).toFixed(1)}K`;
  return `Rs.${Math.round(v).toLocaleString("en-IN")}`;
}
function formatNum(v: number) {
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return `${v}`;
}

type DailyPoint = { date: string; label: string; value: number };
type Tags = { buyingType: "CBO" | "ABO" | null; advantagePlus: boolean; kind: "Scaling" | "Testing" | null };

type AdSet = {
  metaAdSetId: string;
  name: string;
  status: string;
  metaCampaignId: string;
  campaignName: string;
  dailyBudget: number | null;
  adsCount: number;
  tags: Tags;
  current: {
    spend: number;
    purchases: number;
    purchaseValue: number;
    impressions: number;
    clicks: number;
    reach: number;
    roas: number;
    cpp: number;
    ctr: number;
    frequency: number;
  };
  previous: AdSet["current"] | null;
  series: {
    spend: DailyPoint[];
    roas: DailyPoint[];
    cpp: DailyPoint[];
    purchases: DailyPoint[];
    ctr: DailyPoint[];
    frequency: DailyPoint[];
  };
};

type ApiResp = {
  days: number;
  window: { from: string; to: string };
  priorWindow: { from: string; to: string };
  adSets: AdSet[];
};

type Quality = "good" | "decent" | "bad" | "neutral";
function qualityColor(q: Quality): string {
  switch (q) {
    case "good": return SAGE;
    case "decent": return AMBER;
    case "bad": return ROSE;
    default: return MUTED;
  }
}
function qualityFromThreshold(value: number, thresholds: { good: number; decent: number }, lowerIsBetter = false): Quality {
  if (value === 0) return "neutral";
  if (lowerIsBetter) {
    if (value <= thresholds.good) return "good";
    if (value <= thresholds.decent) return "decent";
    return "bad";
  }
  if (value >= thresholds.good) return "good";
  if (value >= thresholds.decent) return "decent";
  return "bad";
}
function qualityFromTrend(curr: number, prev: number | undefined, lowerIsBetter = false): Quality {
  if (prev === undefined || prev === 0) return "neutral";
  const d = (curr - prev) / prev;
  if (Math.abs(d) < 0.05) return "decent";
  const rising = d > 0;
  const good = lowerIsBetter ? !rising : rising;
  return good ? "good" : "bad";
}
function qualityFromBudgetUtil(util: number | null): Quality {
  if (util == null) return "neutral";
  if (util >= 80 && util <= 110) return "good";
  if ((util >= 60 && util < 80) || (util > 110 && util <= 130)) return "decent";
  return "bad";
}

function pctDelta(curr: number, prev: number | undefined): number | null {
  if (prev === undefined || prev === 0) return null;
  return (curr - prev) / prev;
}
function numericDelta(curr: number, prev: number | undefined, lowerIsBetter = false): { text: string; color: string } {
  const d = pctDelta(curr, prev);
  if (d === null) return { text: "—", color: MUTED };
  const pct = (d * 100).toFixed(0);
  const positive = d >= 0;
  const good = lowerIsBetter ? !positive : positive;
  const color = Math.abs(d) < 0.01 ? MUTED : good ? SAGE : ROSE;
  const arrow = Math.abs(d) < 0.01 ? "—" : positive ? "↑" : "↓";
  return { text: `${arrow} ${positive ? "+" : ""}${pct}% vs prior`, color };
}
function qualitativeDelta(curr: number, prev: number | undefined, lowerIsBetter = false): { text: string; color: string } {
  const d = pctDelta(curr, prev);
  if (d === null) return { text: "—", color: MUTED };
  if (Math.abs(d) < 0.05) return { text: "— stable", color: MUTED };
  const rising = d > 0;
  const good = lowerIsBetter ? !rising : rising;
  const color = good ? SAGE : ROSE;
  const word = rising ? "rising" : "falling";
  const arrow = rising ? "↑" : "↓";
  return { text: `${arrow} ${word}`, color };
}

function InlineSpark({ points, color, formatter }: { points: DailyPoint[]; color: string; formatter: (n: number) => string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="flex items-end gap-2">
      {points.map((p) => {
        const h = max > 0 ? Math.max(8, (p.value / max) * 36) : 8;
        return (
          <div key={p.date} className="flex flex-col items-center min-w-[34px]">
            <span className="text-[10px] font-semibold tabular-nums leading-none mb-1" style={{ color: INK }}>
              {formatter(p.value)}
            </span>
            <div className="w-7 rounded-sm" style={{ height: `${h}px`, background: color }} title={`${p.label}: ${p.value}`} />
            <span className="text-[9px] mt-1" style={{ color: MUTED }}>{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  caption: string;
  delta?: { text: string; color: string };
  quality: Quality;
  series: DailyPoint[];
  formatter: (n: number) => string;
};

function MetricCard({ label, value, caption, delta, quality, series, formatter }: MetricCardProps) {
  const color = qualityColor(quality);
  const bg =
    quality === "good" ? `${SAGE}15` :
    quality === "decent" ? `${AMBER}18` :
    quality === "bad" ? `${ROSE}18` :
    CREAM_BG;
  return (
    <div
      className="rounded-xl border p-3 flex items-start justify-between gap-3"
      style={{ background: bg, borderColor: quality === "neutral" ? BORDER : `${color}55` }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold" style={{ color: MUTED }}>{label}</p>
        <p className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: quality === "bad" ? ROSE : INK }}>
          {value}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>{caption}</p>
        {delta && <p className="text-[11px] font-semibold mt-0.5" style={{ color: delta.color }}>{delta.text}</p>}
      </div>
      <div className="shrink-0">
        <InlineSpark points={series} color={color} formatter={formatter} />
      </div>
    </div>
  );
}

function TagChip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${color}22`, color }}>
      {children}
    </span>
  );
}

export function MetaTrendsAdSets() {
  const [days] = useState(3);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [adSetFilter, setAdSetFilter] = useState<string>("");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/meta/trends/ad-sets?days=${days}`)
      .then((r) => r.json())
      .then((d: ApiResp) => {
        if (cancel) return;
        setData(d);
        // Default to first campaign + its first ad set
        if (d.adSets.length > 0) {
          const firstCampaign = d.adSets[0].metaCampaignId;
          setCampaignFilter(firstCampaign);
          const firstAdSetInCampaign = d.adSets.find((s) => s.metaCampaignId === firstCampaign);
          if (firstAdSetInCampaign) setAdSetFilter(firstAdSetInCampaign.metaAdSetId);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [days]);

  // Unique campaigns from the ad-set data
  const campaigns = useMemo(() => {
    if (!data) return [] as { id: string; name: string }[];
    const map = new Map<string, string>();
    for (const s of data.adSets) {
      if (!map.has(s.metaCampaignId)) map.set(s.metaCampaignId, s.campaignName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Ad sets in the chosen campaign
  const adSetsInCampaign = useMemo(() => {
    if (!data || !campaignFilter) return [] as AdSet[];
    return data.adSets.filter((s) => s.metaCampaignId === campaignFilter);
  }, [data, campaignFilter]);

  // The selected ad set
  const selected = useMemo(() => {
    if (!adSetFilter) return null;
    return adSetsInCampaign.find((s) => s.metaAdSetId === adSetFilter) ?? null;
  }, [adSetsInCampaign, adSetFilter]);

  // Switching campaign should auto-pick the first ad set within it
  useEffect(() => {
    if (!data || !campaignFilter) return;
    const stillValid = adSetsInCampaign.some((s) => s.metaAdSetId === adSetFilter);
    if (!stillValid && adSetsInCampaign.length > 0) {
      setAdSetFilter(adSetsInCampaign[0].metaAdSetId);
    }
  }, [data, campaignFilter, adSetsInCampaign, adSetFilter]);

  // Alerts for the SELECTED ad set
  const alerts = useMemo(() => {
    if (!selected) return [] as { tone: "red" | "amber" | "green"; text: string }[];
    const out: { tone: "red" | "amber" | "green"; text: string }[] = [];
    const cur = selected.current;
    const prev = selected.previous;
    if (cur.roas > 0 && cur.roas < 1 && cur.spend > 1000) {
      out.push({ tone: "red", text: `ROAS ${cur.roas.toFixed(2)}x (losing money)` });
    } else if (prev && prev.roas > 0) {
      const d = (cur.roas - prev.roas) / prev.roas;
      if (cur.roas < 1.5 && d < 0) {
        out.push({ tone: "amber", text: `ROAS below target — ${cur.roas.toFixed(2)}x and declining` });
      } else if (d <= -0.3) {
        out.push({ tone: "red", text: `ROAS ${cur.roas.toFixed(2)}x (${(d * 100).toFixed(0)}% vs prior)` });
      }
    }
    if (cur.cpp > 2500 && cur.purchases > 0) {
      out.push({ tone: "red", text: `CPP Rs.${Math.round(cur.cpp).toLocaleString("en-IN")} (above ceiling)` });
    }
    if (cur.frequency > 3) {
      out.push({ tone: "amber", text: `Frequency ${cur.frequency.toFixed(1)}x (above threshold)` });
    }
    if (cur.ctr < 1 && cur.impressions > 1000) {
      out.push({ tone: "amber", text: `CTR ${cur.ctr.toFixed(2)}% (below 1.5% target)` });
    }
    return out;
  }, [selected]);

  if (loading) {
    return (
      <div className="rounded-2xl border p-12 text-center text-sm italic" style={{ background: "white", borderColor: BORDER, color: MUTED }}>
        Loading trends…
      </div>
    );
  }
  if (!data) return null;

  const accent =
    selected?.tags.kind === "Scaling" ? BLUE :
    selected?.tags.kind === "Testing" ? SAGE :
    MUTED;

  const seriesDays = selected ? Math.max(1, selected.series.spend.length) : 1;
  const plannedDaily = selected?.dailyBudget && selected.dailyBudget > 0 ? selected.dailyBudget : null;
  const plannedWindow = plannedDaily ? plannedDaily * seriesDays : null;
  const budgetUtil =
    plannedWindow && plannedWindow > 0 && selected ? Math.round((selected.current.spend / plannedWindow) * 100) : null;
  const spendCaption = plannedWindow && plannedDaily && budgetUtil != null
    ? `${budgetUtil}% of Rs.${formatNum(plannedWindow)} planned (Rs.${formatNum(plannedDaily)}/day × ${seriesDays}d)`
    : "No ad-set budget set in Meta";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: INK }}>Waterful — Meta Ads · Ad Sets</h1>
        <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>
          Last {data.days} days · {data.window.from} – {data.window.to} · vs prior {data.days} days {data.priorWindow.from} – {data.priorWindow.to}
        </p>
      </div>

      {/* Alerts — always visible */}
      <div
        className="rounded-xl border p-3 flex flex-wrap items-center gap-2"
        style={{
          background: alerts.length === 0 ? `${SAGE}10` : `${AMBER}10`,
          borderColor: alerts.length === 0 ? `${SAGE}55` : `${AMBER}55`,
        }}
      >
        <span className="flex items-center gap-1.5 font-semibold text-[12px]" style={{ color: INK }}>
          <Bell size={14} />
          {alerts.length === 0 ? "All clear" : "Needs attention"}
        </span>
        {alerts.length === 0 ? (
          <span className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={{ background: SAGE, color: "white" }}>
            No critical issues for this ad set
          </span>
        ) : (
          alerts.map((a, i) => {
            const color = a.tone === "red" ? ROSE : a.tone === "amber" ? AMBER : SAGE;
            return (
              <span key={i} className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={{ background: color, color: "white" }}>
                {a.text}
              </span>
            );
          })
        )}
      </div>

      {/* Two dropdowns — Campaign + Ad Set */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Campaign</label>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: "white" }}
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Ad Set</label>
          <select
            value={adSetFilter}
            onChange={(e) => setAdSetFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: "white" }}
          >
            {adSetsInCampaign.map((s) => (
              <option key={s.metaAdSetId} value={s.metaAdSetId}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!selected ? (
        <div className="rounded-2xl border p-12 text-center text-sm italic" style={{ background: "white", borderColor: BORDER, color: MUTED }}>
          No ad-set activity in this window.
        </div>
      ) : (
        <>
          {/* Breadcrumb + tags */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm" style={{ color: INK }}>
              <FolderTree size={14} style={{ color: MUTED }} />
              <span className="font-medium">{selected.campaignName}</span>
              <ChevronRight size={14} style={{ color: MUTED }} />
              <span className="font-medium">{selected.name}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const s = selected.status?.toUpperCase();
                const info =
                  s === "ACTIVE" ? { label: "Running", color: SAGE } :
                  s === "PAUSED" ? { label: "Paused", color: AMBER } :
                  s === "DELETED" || s === "ARCHIVED" ? { label: "Deactivated", color: ROSE } :
                  { label: s ?? "Unknown", color: MUTED };
                return (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${info.color}22`, color: info.color }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: info.color }} />
                    {info.label}
                  </span>
                );
              })()}
              {selected.tags.buyingType && (
                <TagChip color={BLUE}>
                  {selected.tags.buyingType}
                  {selected.tags.advantagePlus && " · Advantage+"}
                </TagChip>
              )}
              {selected.tags.kind && <TagChip color={accent}>{selected.tags.kind}</TagChip>}
              <span className="text-[11px]" style={{ color: MUTED }}>
                {selected.adsCount} ads
              </span>
            </div>
          </div>

          {/* Metric cards — 3 cols × 2 rows = 6 */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label={`Spend · ${seriesDays}d`}
              value={formatInr(selected.current.spend)}
              caption={spendCaption}
              delta={qualitativeDelta(selected.current.spend, selected.previous?.spend)}
              quality={qualityFromBudgetUtil(budgetUtil)}
              series={selected.series.spend}
              formatter={(n) => formatInr(n)}
            />
            <MetricCard
              label="ROAS"
              value={`${selected.current.roas.toFixed(2)}x`}
              caption="Target 1.8–2.5x"
              delta={numericDelta(selected.current.roas, selected.previous?.roas)}
              quality={qualityFromThreshold(selected.current.roas, { good: 1.8, decent: 1 })}
              series={selected.series.roas}
              formatter={(n) => n.toFixed(2)}
            />
            <MetricCard
              label="CPP"
              value={selected.current.cpp > 0 ? `Rs.${Math.round(selected.current.cpp).toLocaleString("en-IN")}` : "—"}
              caption="Target Rs.600–1,500"
              delta={numericDelta(selected.current.cpp, selected.previous?.cpp, true)}
              quality={qualityFromThreshold(selected.current.cpp, { good: 1500, decent: 2500 }, true)}
              series={selected.series.cpp}
              formatter={(n) => (n > 0 ? `${Math.round(n / 1000)}K` : "—")}
            />
            <MetricCard
              label="Purchases"
              value={`${selected.current.purchases}`}
              caption="No benchmark"
              delta={numericDelta(selected.current.purchases, selected.previous?.purchases)}
              quality={qualityFromTrend(selected.current.purchases, selected.previous?.purchases)}
              series={selected.series.purchases}
              formatter={(n) => `${n}`}
            />
            <MetricCard
              label="CTR"
              value={`${selected.current.ctr.toFixed(2)}%`}
              caption="Target 1.5–2%+"
              delta={numericDelta(selected.current.ctr, selected.previous?.ctr)}
              quality={qualityFromThreshold(selected.current.ctr, { good: 1.5, decent: 1 })}
              series={selected.series.ctr}
              formatter={(n) => `${n.toFixed(2)}`}
            />
            <MetricCard
              label="Frequency"
              value={selected.current.frequency.toFixed(2)}
              caption="Keep below 3–4x"
              delta={qualitativeDelta(selected.current.frequency, selected.previous?.frequency, true)}
              quality={qualityFromThreshold(selected.current.frequency, { good: 2, decent: 3 }, true)}
              series={selected.series.frequency}
              formatter={(n) => n.toFixed(2)}
            />
          </div>
        </>
      )}

      {/* Metric Guide */}
      <MetricGuide />
    </div>
  );
}

function MetricGuide() {
  const guides = [
    { title: "ROAS — Return on ad spend", target: "Target: 1.8–2.5x", body: "Revenue earned for every Rs.1 spent. Below 1x means losing money on ad spend before cost of goods." },
    { title: "CPP — Cost per purchase", target: "Target: Rs.600–Rs.1,500", body: "Total spend divided by purchases. Set your ceiling based on your average order value and margins." },
    { title: "CTR — Click-through rate", target: "Target: 1.5–2%+", body: "Percentage of people who clicked after seeing the ad. The primary signal of how compelling the creative is." },
    { title: "Frequency", target: "Keep below 3–4x per week", body: "Average times one person saw your ad. Watch alongside CTR — rising frequency with falling CTR signals fatigue." },
    { title: "Spend vs budget", target: "Target: 90–100% utilisation", body: "How much of the ad-set budget Meta is spending. Under-delivery may mean the audience is too narrow or bid is too low." },
    { title: "Purchases", target: "No fixed benchmark", body: "Total conversions from this ad set. Rising purchases with improving ROAS is the signal a batch is ready to scale." },
  ];
  return (
    <section className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
      <h3 className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: MUTED }}>Metric guide</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {guides.map((g) => (
          <div key={g.title} className="rounded-xl border p-3" style={{ borderColor: BORDER, background: "#fafaf7" }}>
            <p className="font-semibold text-[13px]" style={{ color: INK }}>{g.title}</p>
            <p className="text-[11px] mt-0.5" style={{ color: AMBER }}>{g.target}</p>
            <p className="text-[11px] mt-1.5 leading-snug" style={{ color: MUTED }}>{g.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
