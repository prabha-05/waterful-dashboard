"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { IndianRupee, Users, ShoppingBag, PackageX, Ban } from "lucide-react";
import { CollapsibleCard } from "./collapsible-card";
import { IndiaHeatmap } from "./india-heatmap";
import { AnimatedKpiCard } from "./animated-kpi-card";
import type { CustomerDetail, OrderDetail } from "@/lib/sales-aggregations";

function formatCurrency(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
}

const PIE_COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899"];

export type SalesMetricsViewData = {
  totalSales: number;
  totalCustomers: number;
  totalOrders: number;
  rtoCount: number;
  cancelledCount: number;
  top5Orders: { customerName: string; flavour: string; total: number; qty: number; city: string; pincode: string }[];
  paymentDistribution: { method: string; count: number; revenue: number }[];
  productsSold: { product: string; qty: number; revenue: number }[];
  heatmapPoints: Parameters<typeof IndiaHeatmap>[0]["points"];
  stateBreakdown: { state: string; count: number }[];
  cityBreakdown: { city: string; count: number }[];
  unmappedCities: { city: string; count: number }[];
  salesByProduct: { product: string; revenue: number; qty: number; pct: number }[];
  salesByState: { state: string; revenue: number; pct: number }[];
  customers: CustomerDetail[];
  allOrders: OrderDetail[];
  rtoOrders: OrderDetail[];
  cancelledOrders: OrderDetail[];
  statusBreakdown: { status: string; count: number }[];
  rtoByCity: { city: string; count: number }[];
};

export function SalesMetricsView({
  data,
  detailQuery,
}: {
  data: SalesMetricsViewData;
  detailQuery: string;
}) {
  const href = (kind: string) => `/dashboard/sales/detail/${kind}?${detailQuery}`;
  const [showAllProducts, setShowAllProducts] = useState(false);
  const productsToShow = showAllProducts ? data.productsSold : data.productsSold.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* KPI Strip — click any card to open full detail page */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <AnimatedKpiCard
          label="Total Sales"
          value={data.totalSales}
          color="emerald"
          icon={<IndianRupee size={18} />}
          formatter={(v) => formatCurrency(v)}
          href={href("sales")}
        />
        <AnimatedKpiCard
          label="Total Customers"
          value={data.totalCustomers}
          color="violet"
          icon={<Users size={18} />}
          href={href("customers")}
          sublabel="Names, phones & spend"
        />
        <AnimatedKpiCard
          label="Total Orders"
          value={data.totalOrders}
          color="blue"
          icon={<ShoppingBag size={18} />}
          href={href("orders")}
        />
        <AnimatedKpiCard
          label="RTO"
          value={data.rtoCount}
          color="amber"
          icon={<PackageX size={18} />}
          pulse
          href={href("rto")}
        />
        <AnimatedKpiCard
          label="Cancelled"
          value={data.cancelledCount}
          color="rose"
          icon={<Ban size={18} />}
          href={href("cancelled")}
        />
      </div>

      {/* Heat Map + Payment Distribution */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <CollapsibleCard title="Order Heat Map — India">
            <IndiaHeatmap points={data.heatmapPoints} />
            <p className="mt-2 text-xs text-neutral-400">
              Dot size reflects order count. Hover a city for top product and pincodes.
            </p>
            {data.unmappedCities.length > 0 && (
              <details className="mt-3 text-xs text-neutral-500">
                <summary className="cursor-pointer hover:text-neutral-700">
                  {data.unmappedCities.reduce((s, c) => s + c.count, 0)} orders from unmapped cities
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.unmappedCities.map((c) => (
                    <span key={c.city} className="bg-neutral-50 px-2 py-1 rounded">
                      {c.city} ({c.count})
                    </span>
                  ))}
                </div>
              </details>
            )}
          </CollapsibleCard>
        </div>

        <CollapsibleCard title="Payment Distribution">
          {data.paymentDistribution.length === 0 ? (
            <div className="flex h-[300px] flex-col items-center justify-center text-center">
              <p className="text-sm text-neutral-400">Payment data not available.</p>
              <p className="mt-1 text-xs text-neutral-400">
                Re-import Shopify orders with payment method to populate this chart.
              </p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data.paymentDistribution}
                    dataKey="count"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={2}
                  >
                    {data.paymentDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} orders`, ""]} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1 text-sm">
                {data.paymentDistribution.map((p, i) => (
                  <div key={p.method} className="flex justify-between border-b border-neutral-50 py-1">
                    <span className="flex items-center gap-2 text-neutral-700">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      {p.method}
                    </span>
                    <span className="font-medium text-neutral-900">₹{p.revenue.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CollapsibleCard>
      </div>

      {/* Top 5 Orders */}
      <CollapsibleCard title="Top 5 Orders">
        {data.top5Orders.length === 0 ? (
          <p className="py-4 text-sm text-neutral-400">No orders.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Product</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">City</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Pincode</th>
                  <th className="px-4 py-3 text-right font-semibold text-neutral-600">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold text-neutral-600">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.top5Orders.map((o, i) => (
                  <tr key={i} className="border-b border-neutral-100 transition-colors hover:bg-emerald-50/40">
                    <td className="px-4 py-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-xs font-bold text-white">
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-900">{o.customerName}</td>
                    <td className="px-4 py-3 text-neutral-600">{o.flavour}</td>
                    <td className="px-4 py-3 text-neutral-600">{o.city}</td>
                    <td className="px-4 py-3 text-neutral-600">{o.pincode}</td>
                    <td className="px-4 py-3 text-right text-neutral-600">{o.qty}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">₹{o.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      {/* Products Sold */}
      <CollapsibleCard title="Products Sold">
        {data.productsSold.length === 0 ? (
          <p className="py-4 text-sm text-neutral-400">No products sold.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-neutral-500">
                Showing <span className="font-semibold text-neutral-900">{productsToShow.length}</span> of {data.productsSold.length} products
              </p>
              {data.productsSold.length > 10 && (
                <button
                  onClick={() => setShowAllProducts((v) => !v)}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  {showAllProducts ? "Show top 10" : `Show all ${data.productsSold.length}`}
                </button>
              )}
            </div>
            <div style={{ height: Math.max(400, productsToShow.length * 36) }} className="w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productsToShow} layout="vertical">
                <defs>
                  <linearGradient id="productGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 12 }} />
                <YAxis dataKey="product" type="category" width={180} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString()}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="url(#productGrad)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CollapsibleCard>

      {/* State + City breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CollapsibleCard title="Top States">
          <div className="space-y-2">
            {data.stateBreakdown.map((s, i) => (
              <RankRow key={i} rank={i + 1} label={s.state || "—"} count={s.count} tone="violet" />
            ))}
          </div>
        </CollapsibleCard>
        <CollapsibleCard title="Top Cities">
          <div className="space-y-2">
            {data.cityBreakdown.map((c, i) => (
              <RankRow key={i} rank={i + 1} label={c.city || "—"} count={c.count} tone="blue" />
            ))}
          </div>
        </CollapsibleCard>
      </div>
    </div>
  );
}

function RankRow({
  rank,
  label,
  count,
  tone,
}: {
  rank: number;
  label: string;
  count: number;
  tone: "violet" | "blue";
}) {
  const chip =
    tone === "violet"
      ? "from-violet-500 to-fuchsia-500"
      : "from-sky-500 to-indigo-500";
  return (
    <div className="flex items-center justify-between border-b border-neutral-50 py-2">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${chip} text-[11px] font-bold text-white`}
        >
          {rank}
        </span>
        <span className="text-sm text-neutral-700">{label}</span>
      </div>
      <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-900">
        {count} orders
      </span>
    </div>
  );
}
