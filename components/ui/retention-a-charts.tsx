"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CollapsibleCard } from "./collapsible-card";

export function RetentionAContent({
  data,
}: {
  data: {
    totalCustomers: number;
    repeatCustomers: number;
    retentionRate: number;
    churnRate: number;
    avgDaysBetweenOrders: number;
    cohortTable: {
      cohort: string;
      customers: number;
      M0: number;
      M1: number;
      M2: number;
      M3: number;
      M4: number;
      M5: number;
      M6: number;
    }[];
    newVsReturning: { month: string; new: number; returning: number }[];
  };
}) {
  const kpis = [
    { label: "Total Customers", value: data.totalCustomers.toLocaleString() },
    { label: "Repeat Customers", value: data.repeatCustomers.toLocaleString() },
    { label: "Retention Rate", value: `${data.retentionRate}%` },
    { label: "Churn Rate", value: `${data.churnRate}%` },
    { label: "Avg Days Between Orders", value: `${data.avgDaysBetweenOrders} days` },
  ];

  function getCellColor(value: number) {
    if (value >= 80) return "bg-green-200 text-green-900";
    if (value >= 40) return "bg-green-100 text-green-800";
    if (value >= 20) return "bg-yellow-100 text-yellow-800";
    if (value >= 10) return "bg-orange-100 text-orange-800";
    if (value > 0) return "bg-red-100 text-red-800";
    return "bg-neutral-50 text-neutral-300";
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <CollapsibleCard title="Retention Overview">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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

      {/* Cohort Retention Table */}
      <CollapsibleCard title="Cohort Retention (% returning)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left py-3 px-3 font-semibold text-neutral-600">Cohort</th>
                <th className="text-right py-3 px-3 font-semibold text-neutral-600">Users</th>
                <th className="text-center py-3 px-2 font-semibold text-neutral-600">M0</th>
                <th className="text-center py-3 px-2 font-semibold text-neutral-600">M1</th>
                <th className="text-center py-3 px-2 font-semibold text-neutral-600">M2</th>
                <th className="text-center py-3 px-2 font-semibold text-neutral-600">M3</th>
                <th className="text-center py-3 px-2 font-semibold text-neutral-600">M4</th>
                <th className="text-center py-3 px-2 font-semibold text-neutral-600">M5</th>
                <th className="text-center py-3 px-2 font-semibold text-neutral-600">M6</th>
              </tr>
            </thead>
            <tbody>
              {data.cohortTable.map((row) => (
                <tr key={row.cohort} className="border-b border-neutral-100">
                  <td className="py-2 px-3 font-medium text-neutral-900">{row.cohort}</td>
                  <td className="py-2 px-3 text-right text-neutral-600">{row.customers}</td>
                  {["M0", "M1", "M2", "M3", "M4", "M5", "M6"].map((m) => {
                    const val = row[m as keyof typeof row] as number;
                    return (
                      <td key={m} className="py-2 px-2 text-center">
                        <span className={`inline-block w-12 py-1 rounded text-xs font-medium ${getCellColor(val)}`}>
                          {val}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleCard>

      {/* New vs Returning */}
      <CollapsibleCard title="New vs Returning Customers by Month">
        <div className="h-[350px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data.newVsReturning}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                interval={2}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="new" name="New" fill="#171717" radius={[4, 4, 0, 0]} />
              <Bar dataKey="returning" name="Returning" fill="#a3a3a3" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleCard>
    </div>
  );
}
