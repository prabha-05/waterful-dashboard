"use client";

import {
  IndianRupee,
  ShoppingBag,
  Ban,
  PackageX,
  Users,
  Gauge,
  Sparkles,
  CreditCard,
  Package,
  TicketPercent,
} from "lucide-react";
import { IndiaHeatmap } from "./india-heatmap";
import type { BuyerSplit, SalesMetrics } from "@/lib/sales-aggregations";

function formatCurrency(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
}

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/* ─────── Split bar: violet = first-time, emerald = repeat ─────── */
function SplitBar({ split }: { split: BuyerSplit }) {
  const ftPct = pct(split.firstTime, split.total);
  const rpPct = 100 - ftPct;
  if (split.total <= 0) {
    return <div className="h-1.5 w-full rounded-full bg-neutral-100" />;
  }
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div
        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
        style={{ width: `${ftPct}%` }}
      />
      <div
        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
        style={{ width: `${rpPct}%` }}
      />
    </div>
  );
}

function SplitLegend({
  split,
  format,
  size = "base",
}: {
  split: BuyerSplit;
  format: (n: number) => string;
  size?: "sm" | "base";
}) {
  return (
    <div className={`mt-3 flex items-center justify-between gap-3 ${size === "sm" ? "text-sm" : "text-base"}`}>
      <span className="flex items-center gap-2 text-violet-700">
        <span className="h-2 w-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
        <span className="font-bold">{format(split.firstTime)}</span>
        <span className="text-neutral-500">first-timers</span>
      </span>
      <span className="flex items-center gap-2 text-emerald-700">
        <span className="text-neutral-500">repeat</span>
        <span className="font-bold">{format(split.repeat)}</span>
        <span className="h-2 w-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" />
      </span>
    </div>
  );
}

/* ─────── Metric card with personality ─────── */
function MetricCard({
  label,
  icon,
  split,
  format,
  tone,
  tagline,
}: {
  label: string;
  icon: React.ReactNode;
  split: BuyerSplit;
  format: (n: number) => string;
  tone: "emerald" | "sky" | "rose" | "amber" | "indigo" | "violet";
  tagline?: string;
}) {
  const toneMap = {
    emerald: { accent: "from-emerald-600 to-teal-600", icon: "bg-emerald-50 text-emerald-600" },
    sky: { accent: "from-sky-600 to-indigo-600", icon: "bg-sky-50 text-sky-600" },
    rose: { accent: "from-rose-600 to-pink-600", icon: "bg-rose-50 text-rose-600" },
    amber: { accent: "from-amber-600 to-orange-600", icon: "bg-amber-50 text-amber-600" },
    indigo: { accent: "from-indigo-600 to-violet-600", icon: "bg-indigo-50 text-indigo-600" },
    violet: { accent: "from-violet-600 to-fuchsia-600", icon: "bg-violet-50 text-violet-600" },
  }[tone];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-neutral-50 to-transparent opacity-40 blur-2xl transition-opacity group-hover:opacity-70" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</p>
            {tagline && <p className="mt-0.5 text-[10px] italic text-neutral-400">{tagline}</p>}
          </div>
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneMap.icon}`}>
            {icon}
          </span>
        </div>
        <div className={`mt-3 rounded-xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white px-4 py-3 shadow-inner`}>
          <p
            className={`bg-gradient-to-r ${toneMap.accent} bg-clip-text text-3xl font-bold tabular-nums text-transparent`}
          >
            {format(split.total)}
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="font-bold tabular-nums text-violet-700">{format(split.firstTime)}</span>
              <span className="text-neutral-600">new users</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-neutral-600">repeat</span>
              <span className="font-bold tabular-nums text-emerald-700">{format(split.repeat)}</span>
            </span>
          </div>
        </div>
        <div className="mt-3">
          <SplitBar split={split} />
        </div>
      </div>
    </div>
  );
}

/* ─────── Row with split bar (for product / payment lists) ─────── */
function SplitRow({
  label,
  split,
  format,
  rank,
  accent,
}: {
  label: string;
  split: BuyerSplit;
  format: (n: number) => string;
  rank: number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-neutral-100 bg-white p-3 transition-colors hover:border-neutral-200 hover:bg-neutral-50/40">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${accent} text-xs font-bold text-white`}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-medium text-neutral-900">{label}</span>
          <span
            className={`shrink-0 bg-gradient-to-r ${accent} bg-clip-text text-base font-bold tabular-nums text-transparent`}
          >
            {format(split.total)}
          </span>
        </div>
        <div className="mt-2">
          <SplitBar split={split} />
          <SplitLegend split={split} format={format} />
        </div>
      </div>
    </div>
  );
}

/* ─────── Section wrapper ─────── */
function Section({
  title,
  tagline,
  icon,
  tone,
  children,
}: {
  title: string;
  tagline: string;
  icon: React.ReactNode;
  tone: "indigo" | "violet" | "emerald" | "sky" | "amber" | "rose";
  children: React.ReactNode;
}) {
  const toneMap = {
    indigo: "from-indigo-500 to-violet-500",
    violet: "from-violet-500 to-fuchsia-500",
    emerald: "from-emerald-500 to-teal-500",
    sky: "from-sky-500 to-indigo-500",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-pink-500",
  }[tone];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${toneMap} text-white shadow-sm`}
        >
          {icon}
        </span>
        <div>
          <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
          <p className="text-xs italic text-neutral-400">{tagline}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/* ─────── Main view ─────── */
export function SalesSummaryPanels({ metrics }: { metrics: SalesMetrics }) {
  const s = metrics.summaryTable;
  const fmtNum = (n: number) => n.toLocaleString();
  const fmtMoney = (n: number) => formatCurrency(n);

  return (
    <div className="space-y-10">
      {/* Overall Sale */}
      <Section
        title="Overall Sale"
        tagline="The big picture — who's new, who's back for more"
        icon={<Sparkles size={18} />}
        tone="indigo"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Sales"
            tagline="the cash that came in"
            icon={<IndianRupee size={18} />}
            split={s.overallSale.sales}
            format={fmtMoney}
            tone="emerald"
          />
          <MetricCard
            label="Unique Customers"
            tagline="real humans, not bots"
            icon={<Users size={18} />}
            split={s.overallSale.uniqueCustomers}
            format={fmtNum}
            tone="violet"
          />
          <MetricCard
            label="AOV"
            tagline="avg order value"
            icon={<Gauge size={18} />}
            split={s.overallSale.aov}
            format={fmtMoney}
            tone="indigo"
          />
          <MetricCard
            label="Confirmed Orders"
            tagline="sealed and delivered"
            icon={<ShoppingBag size={18} />}
            split={s.overallSale.confirmedOrders}
            format={fmtNum}
            tone="sky"
          />
          <MetricCard
            label="Cancelled Orders"
            tagline="changed their minds"
            icon={<Ban size={18} />}
            split={s.overallSale.cancelledOrders}
            format={fmtNum}
            tone="rose"
          />
          <MetricCard
            label="RTO"
            tagline="sent it, got it back"
            icon={<PackageX size={18} />}
            split={s.overallSale.rto}
            format={fmtNum}
            tone="amber"
          />
        </div>
      </Section>

      {/* Product Sale */}
      <Section
        title="Product Sale"
        tagline="what flew off the shelves"
        icon={<Package size={18} />}
        tone="violet"
      >
        {s.productSale.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/40 p-6 text-center text-sm text-neutral-400">
            No products sold yet. Quiet week.
          </p>
        ) : (
          <div className="space-y-2">
            {s.productSale.map((p, i) => (
              <SplitRow
                key={p.product}
                rank={i + 1}
                label={p.product}
                split={{ total: p.total, firstTime: p.firstTime, repeat: p.repeat }}
                format={fmtNum}
                accent="from-violet-500 to-fuchsia-500"
              />
            ))}
          </div>
        )}
      </Section>

      {/* Payment */}
      <Section
        title="Payment"
        tagline="how the money moved"
        icon={<CreditCard size={18} />}
        tone="sky"
      >
        {s.payment.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/40 p-6 text-center text-sm text-neutral-400">
            No payment method data — re-import Shopify orders to populate this.
          </p>
        ) : (
          <div className="space-y-2">
            {s.payment.map((p, i) => (
              <SplitRow
                key={p.method}
                rank={i + 1}
                label={p.method}
                split={{ total: p.total, firstTime: p.firstTime, repeat: p.repeat }}
                format={fmtMoney}
                accent="from-sky-500 to-indigo-500"
              />
            ))}
          </div>
        )}
      </Section>

      {/* Discount Codes */}
      <Section
        title="Discount Codes Used"
        tagline="coupons clipped"
        icon={<TicketPercent size={18} />}
        tone="amber"
      >
        <p className="rounded-xl border border-dashed border-neutral-200 bg-gradient-to-br from-amber-50/40 to-orange-50/30 p-6 text-center text-sm text-neutral-500">
          Discount code data isn&apos;t tracked in the current dataset.
          <br />
          <span className="text-xs text-neutral-400">
            Add a <code className="rounded bg-white px-1.5 py-0.5 text-amber-700">discountCode</code> column to the order import and this panel will light up.
          </span>
        </p>
      </Section>

      {/* Heat Map */}
      <Section
        title="Heat Map — India"
        tagline="where your customers actually live"
        icon={<Sparkles size={18} />}
        tone="rose"
      >
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <IndiaHeatmap points={metrics.heatmapPoints} />
          <p className="mt-2 text-xs text-neutral-400">
            Dot size reflects order count. Hover a city for top product and pincodes.
          </p>
        </div>
      </Section>
    </div>
  );
}
