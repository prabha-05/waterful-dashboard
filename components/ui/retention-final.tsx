"use client";

import { useEffect, useState } from "react";
import { Percent, BarChart3, Gauge, Wallet, TrendingUp, Heart, Sparkles } from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const CREAM = "#f1e7d3";

type Summary = {
  totalCustomers: number;
  cameBack: number;
  droppedOff: number;
  retentionRate: number;
  repeatFrequency: number;
  totalAov: number;
  arpu: number;
  arpuExpansion: number;
  ltv: number;
  ltvExpansion: number;
};

function formatInr(v: number) {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function KpiCard({
  title,
  subtitle,
  value,
  footer,
  icon: Icon,
  tint,
}: {
  title: string;
  subtitle: string;
  value: string;
  footer: string;
  icon: typeof Percent;
  tint: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5 shadow-sm flex flex-col justify-between"
      style={{ background: "white", borderColor: "#e8dfd0" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: MUTED }}
          >
            {title}
          </p>
          <p className="mt-1 text-xs italic" style={{ color: MUTED }}>
            {subtitle}
          </p>
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${tint}22`, color: tint }}
        >
          <Icon size={16} />
        </div>
      </div>
      <div className="mt-6">
        <p className="text-4xl font-bold tabular-nums" style={{ color: INK }}>
          {value}
        </p>
      </div>
      <p className="mt-3 text-xs" style={{ color: MUTED }}>
        {footer}
      </p>
    </div>
  );
}

function FunnelRow({
  label,
  count,
  pct,
  barColor,
  pctColor,
  showPct,
}: {
  label: string;
  count: number;
  pct: number;
  barColor: string;
  pctColor: string;
  showPct: boolean;
}) {
  const fill = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex items-end justify-between mb-1.5">
        <span className="text-sm font-medium" style={{ color: INK }}>
          {label}
        </span>
        <span className="text-sm tabular-nums" style={{ color: INK }}>
          {count.toLocaleString("en-IN")}
          {showPct && (
            <span
              className="ml-2 text-xs font-semibold"
              style={{ color: pctColor }}
            >
              ({pct.toFixed(1)}%)
            </span>
          )}
        </span>
      </div>
      <div
        className="h-4 w-full rounded-full overflow-hidden"
        style={{ background: CREAM }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${fill}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

export function RetentionFinal() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/retention/summary")
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

  const d: Summary = data ?? {
    totalCustomers: 0,
    cameBack: 0,
    droppedOff: 0,
    retentionRate: 0,
    repeatFrequency: 0,
    totalAov: 0,
    arpu: 0,
    arpuExpansion: 0,
    ltv: 0,
    ltvExpansion: 0,
  };

  const cameBackPct =
    d.totalCustomers > 0 ? (d.cameBack / d.totalCustomers) * 100 : 0;
  const droppedOffPct =
    d.totalCustomers > 0 ? (d.droppedOff / d.totalCustomers) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Retention Rate"
          subtitle="who came back for more"
          value={loading ? "…" : `${d.retentionRate.toFixed(0)}%`}
          footer="Customers with 2+ orders / all customers"
          icon={Percent}
          tint={SAGE}
        />
        <KpiCard
          title="Repeat Frequency"
          subtitle="avg extra orders"
          value={loading ? "…" : `${d.repeatFrequency.toFixed(1)}x`}
          footer="How many times repeat buyers reorder"
          icon={BarChart3}
          tint={AMBER}
        />
        <KpiCard
          title="Total AOV"
          subtitle="avg order value"
          value={loading ? "…" : formatInr(d.totalAov)}
          footer="Total Revenue ÷ Total Orders"
          icon={Gauge}
          tint={ROSE}
        />
      </div>

      {/* Retention Funnel */}
      <div
        className="rounded-2xl border p-6 shadow-sm"
        style={{ background: "white", borderColor: "#e8dfd0" }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-wider mb-5"
          style={{ color: MUTED }}
        >
          Retention Funnel
        </p>
        <div className="space-y-4">
          <FunnelRow
            label="All Customers"
            count={d.totalCustomers}
            pct={100}
            barColor={AMBER}
            pctColor={INK}
            showPct={false}
          />
          <FunnelRow
            label="Came Back"
            count={d.cameBack}
            pct={cameBackPct}
            barColor={SAGE}
            pctColor={SAGE}
            showPct
          />
          <FunnelRow
            label="Dropped Off"
            count={d.droppedOff}
            pct={droppedOffPct}
            barColor={ROSE}
            pctColor={ROSE}
            showPct
          />
        </div>
        <p className="mt-5 text-sm italic" style={{ color: MUTED }}>
          Of everyone who bought, how many came back for a second order?
        </p>
      </div>

      {/* Customer Value section */}
      <div className="pt-2">
        <h2
          className="text-lg font-semibold mb-1"
          style={{ color: INK }}
        >
          Customer Value
        </h2>
        <p className="text-sm italic mb-4" style={{ color: MUTED }}>
          What each customer is worth today — and what they could be worth with better retention.
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="ARPU"
            subtitle="avg revenue per customer"
            value={loading ? "…" : formatInr(d.arpu)}
            footer="Total Revenue ÷ Total Customers"
            icon={Wallet}
            tint={AMBER}
          />
          <KpiCard
            title="ARPU Expansion"
            subtitle="projected repeat revenue / customer"
            value={loading ? "…" : formatInr(d.arpuExpansion)}
            footer="AOV × Retention Rate × Repeat Frequency"
            icon={TrendingUp}
            tint={SAGE}
          />
          <KpiCard
            title="LTV"
            subtitle="lifetime value per customer"
            value={loading ? "…" : formatInr(d.ltv)}
            footer="AOV × Orders per Customer"
            icon={Heart}
            tint={ROSE}
          />
          <KpiCard
            title="LTV Expansion"
            subtitle="projected lifetime value"
            value={loading ? "…" : formatInr(d.ltvExpansion)}
            footer="AOV × [1 + (Retention Rate × Repeat Frequency)]"
            icon={Sparkles}
            tint="#8b5cf6"
          />
        </div>
      </div>
    </div>
  );
}
