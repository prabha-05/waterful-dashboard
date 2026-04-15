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

export function RetentionBContent({
  data,
}: {
  data: {
    avgCLV: number;
    avgRepeatFrequency: number;
    topLoyal: { name: string; orders: number; totalSpend: number }[];
    clvDistribution: { label: string; count: number }[];
    frequencyDistribution: { label: string; count: number }[];
  };
}) {
  const kpis = [
    { label: "Avg Customer Lifetime Value", value: formatCurrency(data.avgCLV) },
    { label: "Avg Repeat Purchase Frequency", value: `${data.avgRepeatFrequency} orders` },
    { label: "Top Spender", value: data.topLoyal[0]?.name || "—" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <CollapsibleCard title="Lifetime Overview">
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

      {/* CLV Distribution */}
      <CollapsibleCard title="Customer Lifetime Value Distribution">
        <div className="h-[300px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.clvDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" name="Customers" fill="#171717" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleCard>

      {/* Purchase Frequency Distribution */}
      <CollapsibleCard title="Purchase Frequency Distribution">
        <div className="h-[300px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.frequencyDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" name="Customers" fill="#404040" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleCard>

      {/* Top Loyal Customers */}
      <CollapsibleCard title="Top 10 Loyal Customers">
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
              {data.topLoyal.map((c, i) => (
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
