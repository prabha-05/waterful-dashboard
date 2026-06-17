"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CollapsibleCard } from "./collapsible-card";

function formatCurrency(value: number) {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
}

export function SalesBContent({
  data,
}: {
  data: {
    totalCustomers: number;
    repeatRate: number;
    topProducts: { product: string; revenue: number }[];
    topStates: { state: string; revenue: number }[];
    topCities: { city: string; revenue: number }[];
    topCustomers: { name: string; orders: number; totalSpend: number }[];
  };
}) {
  const kpis = [
    { label: "Unique Customers", value: data.totalCustomers.toLocaleString() },
    { label: "Repeat Customer Rate", value: `${data.repeatRate}%` },
    { label: "Top Product", value: data.topProducts[0]?.product || "—" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <CollapsibleCard title="Customer Overview">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="bg-neutral-50 rounded-lg p-4 border border-neutral-100"
            >
              <p className="text-sm text-neutral-500">{kpi.label}</p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">{kpi.value}</p>
            </div>
          ))}
        </div>
      </CollapsibleCard>

      {/* Top Products */}
      <CollapsibleCard title="Top 10 Products by Revenue">
        <div className="h-[350px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data.topProducts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 12 }} />
              <YAxis dataKey="product" type="category" width={160} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString()}`, "Revenue"]} />
              <Bar dataKey="revenue" fill="#171717" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleCard>

      {/* Top States */}
      <CollapsibleCard title="Top 10 States by Revenue">
        <div className="h-[350px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data.topStates} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 12 }} />
              <YAxis dataKey="state" type="category" width={120} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString()}`, "Revenue"]} />
              <Bar dataKey="revenue" fill="#404040" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleCard>

      {/* Top Cities */}
      <CollapsibleCard title="Top 10 Cities by Revenue">
        <div className="h-[350px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data.topCities} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 12 }} />
              <YAxis dataKey="city" type="category" width={120} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString()}`, "Revenue"]} />
              <Bar dataKey="revenue" fill="#525252" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleCard>

      {/* Top Repeat Customers */}
      <CollapsibleCard title="Top Repeat Customers">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left py-3 px-4 font-semibold text-neutral-600">Customer</th>
                <th className="text-right py-3 px-4 font-semibold text-neutral-600">Orders</th>
                <th className="text-right py-3 px-4 font-semibold text-neutral-600">Total Spend</th>
              </tr>
            </thead>
            <tbody>
              {data.topCustomers.map((c, i) => (
                <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-3 px-4 text-neutral-900">{c.name}</td>
                  <td className="py-3 px-4 text-right text-neutral-600">{c.orders}</td>
                  <td className="py-3 px-4 text-right text-neutral-900 font-medium">
                    ₹{c.totalSpend.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleCard>
    </div>
  );
}
