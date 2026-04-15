"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
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

export function SalesAContent({
  data,
}: {
  data: {
    totalRevenue: number;
    totalOrders: number;
    aov: number;
    rtoCancelRate: number;
    monthlyRevenue: { month: string; revenue: number }[];
    statusData: { status: string; count: number }[];
  };
}) {
  const kpis = [
    { label: "Total Revenue", value: formatCurrency(data.totalRevenue) },
    { label: "Total Orders", value: data.totalOrders.toLocaleString() },
    { label: "Avg Order Value", value: formatCurrency(data.aov) },
    { label: "RTO + Cancel Rate", value: `${data.rtoCancelRate}%` },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <CollapsibleCard title="Key Metrics">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Monthly Revenue Trend */}
      <CollapsibleCard title="Monthly Revenue Trend">
        <div className="h-[350px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={data.monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                interval={2}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [`₹${Number(value).toLocaleString()}`, "Revenue"]}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#171717"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleCard>

      {/* Orders by Status */}
      <CollapsibleCard title="Orders by Status">
        <div className="h-[300px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.statusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="status" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#171717" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleCard>
    </div>
  );
}
