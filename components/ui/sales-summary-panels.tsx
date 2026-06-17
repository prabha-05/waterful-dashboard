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
import { shortenProductName } from "@/lib/product-name";

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
    return <div className="h-1.5 w-full rounded-full bg-neutral-900" />;
  }
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-900">
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
    rose: { accent: "from-rose-600 to-pink-600", icon: "bg-rose-950/30 text-rose-600" },
    amber: { accent: "from-amber-600 to-orange-600", icon: "bg-cyan-950/30 text-amber-600" },
    indigo: { accent: "from-indigo-600 to-violet-600", icon: "bg-indigo-50 text-indigo-600" },
    violet: { accent: "from-violet-600 to-fuchsia-600", icon: "bg-violet-50 text-violet-600" },
  }[tone];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
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
        <div className={`mt-3 rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-50 to-white px-4 py-3 shadow-inner`}>
          <p
            className={`bg-gradient-to-r ${toneMap.accent} bg-clip-text text-3xl font-bold tabular-nums text-transparent`}
          >
            {format(split.total)}
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            {/* New users — left */}
            <div>
              <p className="text-base font-bold tabular-nums text-violet-700">{format(split.firstTime)}</p>
              <p className="text-xs tabular-nums text-neutral-500">
                <span className="font-semibold text-violet-600">{pct(split.firstTime, split.total)}%</span>{" "}
                new
              </p>
            </div>
            {/* Repeat — right */}
            <div className="text-right">
              <p className="text-base font-bold tabular-nums text-emerald-700">{format(split.repeat)}</p>
              <p className="text-xs tabular-nums text-neutral-500">
                repeat{" "}
                <span className="font-semibold text-emerald-600">{pct(split.repeat, split.total)}%</span>
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <SplitBar split={split} />
        </div>
      </div>
    </div>
  );
}

/* ─────── Multi-slice donut chart ───────
   Pure SVG. One slice per data row, colored from PIE_COLORS palette. Center
   shows the grand total; legend below shows each slice's value + share %. */
const PIE_COLORS = [
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ec4899", // pink
  "#3b82f6", // blue
  "#ef4444", // red
];

function MultiSlicePie({
  slices,
  total,
  totalFormatter = (v: number) => v.toLocaleString(),
  size = 180,
}: {
  slices: { name: string; value: number }[];
  total: number;
  totalFormatter?: (v: number) => string;
  size?: number;
}) {
  if (total === 0 || slices.length === 0) return null;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const innerR = r * 0.55;

  const arc = (startFrac: number, endFrac: number) => {
    const a0 = startFrac * Math.PI * 2 - Math.PI / 2;
    const a1 = endFrac * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const ix0 = cx + innerR * Math.cos(a0);
    const iy0 = cy + innerR * Math.sin(a0);
    const ix1 = cx + innerR * Math.cos(a1);
    const iy1 = cy + innerR * Math.sin(a1);
    const largeArc = endFrac - startFrac > 0.5 ? 1 : 0;
    return [
      `M ${x0} ${y0}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix0} ${iy0}`,
      "Z",
    ].join(" ");
  };

  let cursor = 0;
  const paths = slices.map((sl, i) => {
    const frac = sl.value / total;
    const start = cursor;
    const end = cursor + frac;
    cursor = end;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    return { ...sl, color, start, end };
  });

  // Edge case: single slice = full circle
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {paths.length === 1 ? (
            <circle cx={cx} cy={cy} r={r} fill={paths[0].color} />
          ) : (
            paths.map((p, i) => (
              <path key={i} d={arc(p.start, p.end)} fill={p.color} />
            ))
          )}
          <circle cx={cx} cy={cy} r={innerR} fill="white" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-wider text-neutral-400">Total</span>
          <span className="text-base font-bold tabular-nums text-white">{totalFormatter(total)}</span>
        </div>
      </div>
      {/* Legend: one row per slice with value + % */}
      <div className="flex flex-col gap-1.5 text-xs w-full">
        {paths.map((p, i) => {
          const pct = Math.round((p.value / total) * 100);
          return (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-neutral-300 truncate" title={p.name}>
                <span className="inline-block h-3 w-3 rounded-sm shrink-0" style={{ background: p.color }} />
                <span className="truncate">{p.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-neutral-400">
                {totalFormatter(p.value)} <span className="text-neutral-400">· {pct}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────── Data table with CSV download — paired with StackedSplitBars ─────── */
function SplitDataTable({
  title,
  labelHeader,
  rows,
  csvFilename,
}: {
  title: string;
  labelHeader: string;
  rows: { name: string; firstTime: number; repeat: number }[];
  csvFilename: string;
}) {
  const downloadCsv = () => {
    const header = [labelHeader, "Total", "New customers", "Repeat customers", "Repeat %"];
    const body = rows.map((r) => {
      const total = r.firstTime + r.repeat;
      const repPct = total > 0 ? ((r.repeat / total) * 100).toFixed(1) + "%" : "0%";
      return [r.name, total, r.firstTime, r.repeat, repPct];
    });
    const totalsRow = rows.reduce(
      (a, r) => ({
        firstTime: a.firstTime + r.firstTime,
        repeat: a.repeat + r.repeat,
      }),
      { firstTime: 0, repeat: 0 },
    );
    const grandTotal = totalsRow.firstTime + totalsRow.repeat;
    body.push([
      "Total",
      grandTotal,
      totalsRow.firstTime,
      totalsRow.repeat,
      grandTotal > 0 ? ((totalsRow.repeat / grandTotal) * 100).toFixed(1) + "%" : "0%",
    ]);
    const csv = [header, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${csvFilename}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const grand = rows.reduce(
    (a, r) => ({ firstTime: a.firstTime + r.firstTime, repeat: a.repeat + r.repeat }),
    { firstTime: 0, repeat: 0 },
  );
  const grandTotal = grand.firstTime + grand.repeat;

  return (
    <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-[#0a0a0a]/60 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {title} — table
        </p>
        <button
          onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-[#0a0a0a] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:bg-[#0a0a0a]"
          title="Download as CSV"
        >
          <span aria-hidden="true">⬇</span> Download CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0a0a0a]/60">
              {[labelHeader, "Total", "New customers", "Repeat customers", "Repeat %"].map((h, i) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 whitespace-nowrap"
                  style={{ textAlign: i === 0 ? "left" : "right" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.firstTime + r.repeat;
              const repPct = total > 0 ? (r.repeat / total) * 100 : 0;
              return (
                <tr key={r.name} className="border-t border-neutral-800">
                  <td className="px-3 py-2.5 text-neutral-300">{r.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-white">{total.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: VIOLET }}>{r.firstTime.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: EMERALD }}>{r.repeat.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: EMERALD }}>{repPct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-800 bg-[#0a0a0a]/60">
              <td className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-300">Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold text-white">{grandTotal.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: VIOLET }}>{grand.firstTime.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: EMERALD }}>{grand.repeat.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: EMERALD }}>
                {grandTotal > 0 ? ((grand.repeat / grandTotal) * 100).toFixed(1) : "0.0"}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ─────── Horizontal stacked bars: first-time vs repeat per category ───────
   Matches the hand-drawn sketch: one row per product, label on the LEFT,
   horizontal bar on the RIGHT stacked with violet (new) + emerald (repeat).
   Bar width is proportional to the largest row so visual comparison is easy.
   Legend at the bottom. */
const VIOLET = "#8b5cf6";
const EMERALD = "#10b981";

function StackedSplitBars({
  data,
}: {
  data: { name: string; firstTime: number; repeat: number }[];
}) {
  const max = Math.max(...data.map((d) => d.firstTime + d.repeat), 1);
  return (
    <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
      <div className="space-y-3">
        {data.map((d) => {
          const total = d.firstTime + d.repeat;
          const widthPct = total > 0 ? (total / max) * 100 : 0;
          const ftPctOfTotal = total > 0 ? (d.firstTime / total) * 100 : 0;
          const repPctOfTotal = total > 0 ? (d.repeat / total) * 100 : 0;
          return (
            <div key={d.name} className="flex items-center gap-3">
              {/* Label on the left */}
              <p
                className="w-64 shrink-0 text-sm text-neutral-300 truncate"
                title={d.name}
              >
                {d.name}
              </p>

              {/* Horizontal stacked bar */}
              <div className="flex-1 relative h-7">
                <div
                  className="absolute inset-y-0 left-0 flex rounded-md overflow-hidden shadow-sm"
                  style={{ width: `${widthPct}%` }}
                  title={`${d.name}: ${d.firstTime} new + ${d.repeat} repeat`}
                >
                  {d.firstTime > 0 && (
                    <div style={{ background: VIOLET, width: `${ftPctOfTotal}%` }} />
                  )}
                  {d.repeat > 0 && (
                    <div style={{ background: EMERALD, width: `${repPctOfTotal}%` }} />
                  )}
                </div>
              </div>

              {/* Total count on the right */}
              <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-white">
                {total.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-5 flex items-center justify-center gap-5 text-xs">
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: VIOLET }} />
          New customers
        </span>
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: EMERALD }} />
          Repeat customers
        </span>
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
          <h2 className="text-lg font-bold text-white">{title}</h2>
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

      {/* Product Sales Summary */}
      <Section
        title="Product Sales Summary"
        tagline="what flew off the shelves"
        icon={<Package size={18} />}
        tone="violet"
      >
        {s.productSale.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 bg-[#0a0a0a]/40 p-6 text-center text-sm text-neutral-400">
            No products sold yet. Quiet week.
          </p>
        ) : (() => {
          // Merge duplicate-after-shortening rows (see comment in StackedSplitBars
          // section). Used by both the chart and the table below.
          const merged = new Map<string, { name: string; firstTime: number; repeat: number }>();
          for (const p of s.productSale) {
            const name = shortenProductName(p.product);
            const existing = merged.get(name);
            if (existing) {
              existing.firstTime += p.firstTime;
              existing.repeat += p.repeat;
            } else {
              merged.set(name, { name, firstTime: p.firstTime, repeat: p.repeat });
            }
          }
          const rows = Array.from(merged.values()).sort(
            (a, b) => b.firstTime + b.repeat - (a.firstTime + a.repeat),
          );
          return (
            <div className="space-y-4">
              <StackedSplitBars data={rows} />
              <SplitDataTable
                title="Products"
                labelHeader="Product"
                rows={rows}
                csvFilename="product-sales-summary"
              />
            </div>
          );
        })()}
      </Section>

      {/* Payment */}
      <Section
        title="Payment"
        tagline="how the money moved"
        icon={<CreditCard size={18} />}
        tone="sky"
      >
        {s.payment.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 bg-[#0a0a0a]/40 p-6 text-center text-sm text-neutral-400">
            No payment method data — re-import Shopify orders to populate this.
          </p>
        ) : (() => {
          const rows = s.payment.map((p) => ({
            name: p.method,
            firstTime: p.firstTime,
            repeat: p.repeat,
          }));
          // Pie slices = one per payment method (total revenue per method)
          const pieSlices = s.payment.map((p) => ({ name: p.method, value: p.total }));
          const pieTotal = pieSlices.reduce((a, sl) => a + sl.value, 0);
          return (
            <div className="space-y-4">
              {/* Bar chart on the left, pie on the right */}
              <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
                <div className="flex-1 min-w-0">
                  <StackedSplitBars data={rows} />
                </div>
                <div className="flex items-center justify-center rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5 md:w-72">
                  <MultiSlicePie
                    slices={pieSlices}
                    total={pieTotal}
                    totalFormatter={formatCurrency}
                  />
                </div>
              </div>
              <SplitDataTable
                title="Payment methods"
                labelHeader="Method"
                rows={rows}
                csvFilename="payment-summary"
              />
            </div>
          );
        })()}
      </Section>

      {/* Discount Codes */}
      <Section
        title="Discount Codes Used"
        tagline="coupons clipped"
        icon={<TicketPercent size={18} />}
        tone="amber"
      >
        {s.discountCodes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 bg-gradient-to-br from-amber-50/40 to-orange-50/30 p-6 text-center text-sm text-neutral-500">
            No discount codes used in this period.
          </p>
        ) : (() => {
          const rows = s.discountCodes.map((p) => ({
            name: p.code,
            firstTime: p.firstTime,
            repeat: p.repeat,
          }));
          const pieSlices = s.discountCodes.map((p) => ({ name: p.code, value: p.total }));
          const pieTotal = pieSlices.reduce((a, sl) => a + sl.value, 0);
          return (
            <div className="space-y-4">
              {/* Bar chart left, pie right */}
              <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
                <div className="flex-1 min-w-0">
                  <StackedSplitBars data={rows} />
                </div>
                <div className="flex items-center justify-center rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5 md:w-72">
                  <MultiSlicePie
                    slices={pieSlices}
                    total={pieTotal}
                    totalFormatter={formatCurrency}
                  />
                </div>
              </div>
              <SplitDataTable
                title="Discount codes"
                labelHeader="Code"
                rows={rows}
                csvFilename="discount-codes-summary"
              />
            </div>
          );
        })()}
      </Section>

      {/* Heat Map */}
      <Section
        title="Heat Map — India"
        tagline="where your customers actually live"
        icon={<Sparkles size={18} />}
        tone="rose"
      >
        <div className="rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-5 shadow-sm">
          <IndiaHeatmap points={metrics.heatmapPoints} />
          <p className="mt-2 text-xs text-neutral-400">
            Dot size reflects order count. Hover a city for top product and pincodes.
          </p>
        </div>
      </Section>
    </div>
  );
}
