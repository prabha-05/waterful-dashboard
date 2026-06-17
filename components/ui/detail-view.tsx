"use client";

import { useState } from "react";
import { Phone, Copy, MapPin, Package } from "lucide-react";
import type { SalesMetrics, CustomerDetail, OrderDetail } from "@/lib/sales-aggregations";

export type DetailKind = "sales" | "customers" | "orders" | "rto" | "cancelled";

function formatCurrency(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
}

export function DetailView({
  kind,
  metrics,
}: {
  kind: DetailKind;
  metrics: SalesMetrics;
}) {
  if (kind === "sales") return <SalesDetail metrics={metrics} />;
  if (kind === "customers") return <CustomersDetail customers={metrics.customers} />;
  if (kind === "orders")
    return (
      <OrdersDetail
        title="All Orders"
        orders={metrics.allOrders}
        status={metrics.statusBreakdown}
        tone="blue"
      />
    );
  if (kind === "rto")
    return (
      <OrdersDetail
        title="RTO Orders"
        orders={metrics.rtoOrders}
        status={metrics.rtoByCity.map((c) => ({ status: c.city, count: c.count }))}
        statusLabel="Hotspot cities"
        tone="amber"
      />
    );
  return (
    <OrdersDetail
      title="Cancelled Orders"
      orders={metrics.cancelledOrders}
      tone="rose"
    />
  );
}

/* ─────────── SALES DETAIL ─────────── */

function SalesDetail({ metrics }: { metrics: SalesMetrics }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryStat label="Total Revenue" value={formatCurrency(metrics.totalSales)} tone="emerald" />
        <SummaryStat label="Orders" value={metrics.totalOrders.toLocaleString()} tone="emerald" />
        <SummaryStat
          label="Avg Order Value"
          value={
            metrics.totalOrders > 0
              ? formatCurrency(Math.round(metrics.totalSales / metrics.totalOrders))
              : "—"
          }
          tone="emerald"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Revenue by Product" icon={<Package size={16} />}>
          <div className="space-y-3">
            {metrics.salesByProduct.map((p, i) => (
              <BarRow key={i} label={p.product} pct={p.pct} right={formatCurrency(p.revenue)} tone="emerald" />
            ))}
          </div>
        </Panel>
        <Panel title="Revenue by State" icon={<MapPin size={16} />}>
          <div className="space-y-3">
            {metrics.salesByState.map((s, i) => (
              <BarRow key={i} label={s.state} pct={s.pct} right={formatCurrency(s.revenue)} tone="teal" />
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Payment Method Mix">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.paymentDistribution.map((p) => (
            <div
              key={p.method}
              className="rounded-xl border border-neutral-200 bg-gradient-to-br from-emerald-50 to-white p-4"
            >
              <p className="text-xs uppercase tracking-wide text-neutral-500">{p.method}</p>
              <p className="mt-1 text-xl font-bold text-neutral-900">{p.count}</p>
              <p className="text-xs text-neutral-500">₹{p.revenue.toLocaleString()}</p>
            </div>
          ))}
          {metrics.paymentDistribution.length === 0 && (
            <p className="col-span-full text-sm text-neutral-400">No payment method data.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ─────────── CUSTOMERS DETAIL ─────────── */

function CustomersDetail({ customers }: { customers: CustomerDetail[] }) {
  const [q, setQ] = useState("");
  const filtered = customers.filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      c.phone.toLowerCase().includes(s) ||
      c.city.toLowerCase().includes(s) ||
      c.pincode.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryStat label="Unique Customers" value={customers.length.toLocaleString()} tone="violet" />
        <SummaryStat
          label="Repeat Customers"
          value={customers.filter((c) => c.orderCount > 1).length.toLocaleString()}
          tone="violet"
        />
        <SummaryStat
          label="Top Spender"
          value={customers[0] ? formatCurrency(customers[0].totalSpent) : "—"}
          tone="violet"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          Showing <span className="font-semibold text-neutral-900">{filtered.length}</span> of{" "}
          {customers.length}
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, phone, city, pincode…"
          className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.slice(0, 300).map((c, i) => (
          <CustomerCard key={i} customer={c} />
        ))}
      </div>
      {filtered.length > 300 && (
        <p className="text-center text-xs text-neutral-400">
          Showing first 300. Narrow your search to see more.
        </p>
      )}
    </div>
  );
}

function CustomerCard({ customer }: { customer: CustomerDetail }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(customer.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-violet-100 to-fuchsia-100 opacity-50 blur-xl transition-opacity group-hover:opacity-80" />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-neutral-900">{customer.name}</p>
            <p className="truncate text-xs text-neutral-500">
              {customer.city}
              {customer.pincode && <> · {customer.pincode}</>}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {customer.orderCount} {customer.orderCount === 1 ? "order" : "orders"}
          </span>
        </div>

        <a
          href={`tel:${customer.phone}`}
          className="mt-3 flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-50 to-fuchsia-50 px-3 py-2 text-sm font-mono font-semibold text-violet-900 transition-colors hover:from-violet-100 hover:to-fuchsia-100"
        >
          <Phone size={14} className="text-violet-600" />
          <span className="flex-1">{customer.phone || "—"}</span>
          <button
            onClick={copy}
            className="rounded p-1 text-violet-500 hover:bg-white hover:text-violet-900"
            title="Copy"
          >
            <Copy size={12} />
          </button>
        </a>
        {copied && (
          <p className="mt-1 text-[10px] text-emerald-600">Copied!</p>
        )}

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-neutral-500">Lifetime spend</span>
          <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text font-bold text-transparent">
            ₹{customer.totalSpent.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────── ORDERS DETAIL (shared for orders/rto/cancelled) ─────────── */

function OrdersDetail({
  title,
  orders,
  status,
  statusLabel = "Status breakdown",
  tone,
}: {
  title: string;
  orders: OrderDetail[];
  status?: { status: string; count: number }[];
  statusLabel?: string;
  tone: "blue" | "amber" | "rose";
}) {
  const [q, setQ] = useState("");
  const toneClass = {
    blue: {
      chip: "from-sky-100 to-indigo-100 text-indigo-700",
      head: "bg-sky-50",
      hover: "hover:bg-sky-50/40",
      focus: "focus:border-sky-400 focus:ring-sky-100",
      accent: "from-sky-600 to-indigo-600",
    },
    amber: {
      chip: "from-amber-100 to-orange-100 text-amber-800",
      head: "bg-amber-50",
      hover: "hover:bg-amber-50/40",
      focus: "focus:border-amber-400 focus:ring-amber-100",
      accent: "from-amber-600 to-orange-600",
    },
    rose: {
      chip: "from-rose-100 to-pink-100 text-rose-800",
      head: "bg-rose-50",
      hover: "hover:bg-rose-50/40",
      focus: "focus:border-rose-400 focus:ring-rose-100",
      accent: "from-rose-600 to-pink-600",
    },
  }[tone];

  const filtered = orders.filter((o) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      o.customerName.toLowerCase().includes(s) ||
      o.phone.toLowerCase().includes(s) ||
      o.city.toLowerCase().includes(s) ||
      o.pincode.toLowerCase().includes(s) ||
      o.product.toLowerCase().includes(s) ||
      String(o.orderId).includes(s)
    );
  });

  const totalValue = filtered.reduce((s, o) => s + o.total, 0);
  const isLossView = tone === "amber" || tone === "rose";
  const totalLabel = isLossView ? "Est. Lost Value" : "Total Value";
  const avgLabel = isLossView ? "Avg Lost / Order" : "Avg Value";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryStat label={title} value={orders.length.toLocaleString()} tone={tone} />
        <SummaryStat label={totalLabel} value={formatCurrency(Math.round(totalValue))} tone={tone} />
        <SummaryStat
          label={avgLabel}
          value={filtered.length ? formatCurrency(Math.round(totalValue / filtered.length)) : "—"}
          tone={tone}
        />
      </div>
      {isLossView && (
        <p className="text-xs text-neutral-400">
          RTO/Cancelled rows have zero total in the source data. Values are estimated per row using, in order of preference: (1) the same customer&apos;s price for the same product, (2) their average spend per unit, (3) the period&apos;s average price for that product.
        </p>
      )}

      {status && status.length > 0 && (
        <Panel title={statusLabel}>
          <div className="flex flex-wrap gap-2">
            {status.map((s) => (
              <span
                key={s.status}
                className={`rounded-full bg-gradient-to-r ${toneClass.chip} px-3 py-1 text-xs font-medium`}
              >
                {s.status}: <span className="font-bold">{s.count}</span>
              </span>
            ))}
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          Showing <span className="font-semibold text-neutral-900">{filtered.length}</span> of {orders.length}
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, phone, city, product, order #…"
          className={`w-full max-w-sm rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${toneClass.focus}`}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full text-sm">
            <thead className={`sticky top-0 ${toneClass.head} backdrop-blur-sm`}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">City / Pin</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-600">Qty</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((o, i) => (
                <tr key={i} className={`border-t border-neutral-100 ${toneClass.hover}`}>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500">#{o.orderId}</td>
                  <td className="px-4 py-3 font-medium text-neutral-900">{o.customerName}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`tel:${o.phone}`}
                      className="inline-flex items-center gap-1.5 font-mono font-semibold text-neutral-800 hover:underline"
                    >
                      <Phone size={12} className="text-neutral-400" />
                      {o.phone || "—"}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{o.product}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {o.city}
                    {o.pincode && <span className="text-neutral-400"> · {o.pincode}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full bg-gradient-to-r ${toneClass.chip} px-2 py-0.5 text-[11px] font-medium`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-600">{o.qty}</td>
                  <td className={`px-4 py-3 text-right font-semibold`}>
                    <span className={`bg-gradient-to-r ${toneClass.accent} bg-clip-text text-transparent`}>
                      ₹{o.total.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 500 && (
          <p className="border-t border-neutral-100 bg-neutral-50 py-2 text-center text-xs text-neutral-500">
            Showing first 500 of {filtered.length}. Narrow your search to see more.
          </p>
        )}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-neutral-400">No matching orders.</p>
        )}
      </div>
    </div>
  );
}

/* ─────────── Shared primitives ─────────── */

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "violet" | "blue" | "amber" | "rose";
}) {
  const accent = {
    emerald: "from-emerald-600 to-teal-600",
    violet: "from-violet-600 to-fuchsia-600",
    blue: "from-sky-600 to-indigo-600",
    amber: "from-amber-600 to-orange-600",
    rose: "from-rose-600 to-pink-600",
  }[tone];
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 bg-gradient-to-r ${accent} bg-clip-text text-2xl font-bold text-transparent tabular-nums`}>
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  children,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        {icon && <span className="text-neutral-500">{icon}</span>}
        {title}
      </h3>
      {children}
    </div>
  );
}

function BarRow({
  label,
  pct,
  right,
  tone,
}: {
  label: string;
  pct: number;
  right: string;
  tone: "emerald" | "teal" | "violet" | "blue" | "amber" | "rose";
}) {
  const gradient: Record<typeof tone, string> = {
    emerald: "from-emerald-400 to-emerald-600",
    teal: "from-teal-400 to-cyan-600",
    violet: "from-violet-400 to-fuchsia-600",
    blue: "from-sky-400 to-indigo-600",
    amber: "from-amber-400 to-orange-600",
    rose: "from-rose-400 to-pink-600",
  };
  return (
    <div className="text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="truncate text-neutral-700">{label}</span>
        <span className="ml-2 shrink-0 font-medium text-neutral-900">
          {right} <span className="text-xs text-neutral-400">· {pct}%</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient[tone]} transition-all duration-500`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
