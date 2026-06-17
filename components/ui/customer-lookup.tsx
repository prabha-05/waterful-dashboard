"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Search,
  Phone,
  MapPin,
  Calendar,
  ShoppingBag,
  Wallet,
  CreditCard,
  Heart,
  Crown,
  AlertTriangle,
  Moon,
  Sparkles,
} from "lucide-react";

type Profile = {
  name: string;
  mobile: string;
  status: "Active" | "Warm" | "At-risk" | "Dormant";
  firstOrderDate: string;
  lastOrderDate: string;
  daysSince: number;
  daysActive: number;
  totalOrders: number;
  totalSpent: number;
  aov: number;
  biggestOrder: number;
  avgGapDays: number | null;
  isVip: boolean;
};

type CustomerResponse =
  | { found: false; phone: string }
  | {
      found: true;
      profile: Profile;
      addresses: { city: string; state: string; pincode: string; count: number }[];
      topFlavours: { flavour: string; qty: number; orders: number; revenue: number }[];
      paymentMethods: { method: string; orders: number; revenue: number }[];
      monthly: { month: string; orders: number; revenue: number }[];
      orders: {
        id: number;
        date: string;
        flavour: string;
        qty: number;
        total: number;
        status: string;
        paymentMethod: string;
        orderId: number;
      }[];
    };

const ROSE = "#d97777";
const SAGE = "#7a9471";
const AMBER = "#c99954";
const INK = "#4a3a2e";
const CARD = "white";
const BORDER = "#e8dcc8";

function formatCurrency(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v}`;
}

function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function monthLabel(m: string) {
  const [y, mm] = m.split("-").map(Number);
  return new Date(y, mm - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function statusStyle(s: Profile["status"]): { bg: string; fg: string; Icon: typeof Heart } {
  switch (s) {
    case "Active":
      return { bg: `${SAGE}22`, fg: SAGE, Icon: Heart };
    case "Warm":
      return { bg: `${AMBER}22`, fg: AMBER, Icon: Sparkles };
    case "At-risk":
      return { bg: `${ROSE}22`, fg: ROSE, Icon: AlertTriangle };
    case "Dormant":
      return { bg: "#9a857122", fg: "#7a6551", Icon: Moon };
  }
}

export function CustomerLookup() {
  const [input, setInput] = useState("");
  const [data, setData] = useState<CustomerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setError(null);
    setData(null);
    const digits = input.replace(/\D/g, "");
    if (digits.length < 6) {
      setError("Enter at least 6 digits.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/retention/customer?phone=${encodeURIComponent(input)}`);
      const json = await res.json();
      if (!res.ok) setError(json.error || "Lookup failed");
      else setData(json);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className="rounded-2xl border p-5 shadow-sm"
      style={{ borderColor: BORDER, background: CARD }}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.3em]"
            style={{ color: AMBER, fontFamily: "Georgia, serif" }}
          >
            <Search size={12} /> Customer Lookup
          </p>
          <h3
            className="mt-1 text-lg font-semibold"
            style={{ fontFamily: "Georgia, serif", color: INK }}
          >
            Pull the full file by phone number
          </h3>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-2 rounded-xl border px-3 py-2"
          style={{ borderColor: BORDER, background: "#fdfaf4" }}
        >
          <Phone size={14} style={{ color: ROSE }} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="e.g. 9876543210"
            className="w-60 bg-transparent text-sm outline-none"
            style={{ color: INK }}
          />
        </div>
        <button
          onClick={search}
          disabled={loading}
          className="rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
          style={{ background: INK }}
        >
          {loading ? "Searching…" : "Look up"}
        </button>
        {error && (
          <span className="text-sm" style={{ color: ROSE }}>
            {error}
          </span>
        )}
      </div>

      {data && data.found === false && (
        <div
          className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: "#d9c9b0", color: INK }}
        >
          No customer found for this number.
        </div>
      )}

      {data && data.found === true && <Dossier data={data} />}
    </section>
  );
}

function Dossier({
  data,
}: {
  data: Extract<CustomerResponse, { found: true }>;
}) {
  const p = data.profile;
  const s = statusStyle(p.status);
  const StatusIcon = s.Icon;
  const address = data.addresses[0];

  const initials = p.name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mt-5 space-y-5">
      {/* Hero */}
      <div
        className="flex flex-wrap items-center gap-4 rounded-2xl border p-5"
        style={{ borderColor: BORDER, background: "#fdf9f1" }}
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold"
          style={{ background: ROSE, color: "white", fontFamily: "Georgia, serif" }}
        >
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4
              className="text-xl font-bold"
              style={{ fontFamily: "Georgia, serif", color: INK }}
            >
              {p.name}
            </h4>
            {p.isVip && (
              <span
                className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ background: `${AMBER}22`, color: AMBER }}
              >
                <Crown size={10} /> VIP
              </span>
            )}
            <span
              className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ background: s.bg, color: s.fg }}
            >
              <StatusIcon size={10} /> {p.status}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs" style={{ color: "#8a7763" }}>
            <span className="flex items-center gap-1">
              <Phone size={11} /> {p.mobile}
            </span>
            {address && (address.city || address.state) && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {[address.city, address.state, address.pincode].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatTile icon={<ShoppingBag size={14} />} label="Total orders" value={p.totalOrders.toLocaleString()} />
        <StatTile icon={<Wallet size={14} />} label="Total spent" value={formatCurrency(p.totalSpent)} />
        <StatTile icon={<Sparkles size={14} />} label="Average order" value={formatCurrency(p.aov)} />
        <StatTile icon={<Calendar size={14} />} label="First order" value={formatDateLong(p.firstOrderDate)} />
        <StatTile icon={<Calendar size={14} />} label="Last order" value={formatDateLong(p.lastOrderDate)} />
        <StatTile
          icon={<Heart size={14} />}
          label="Days since"
          value={`${p.daysSince}d`}
          caption={p.avgGapDays !== null ? `avg gap ${p.avgGapDays}d` : undefined}
        />
      </div>

      {/* Top flavours + payment + addresses */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Favourite flavours" subtitle="by revenue">
          {data.topFlavours.slice(0, 5).map((f) => (
            <div key={f.flavour} className="flex items-center justify-between py-1.5 text-sm">
              <span className="truncate pr-2" style={{ color: INK }}>
                {f.flavour}
              </span>
              <span className="shrink-0 text-xs" style={{ color: "#8a7763" }}>
                {f.qty} units · {formatCurrency(f.revenue)}
              </span>
            </div>
          ))}
        </Card>
        <Card title="Payment methods" icon={<CreditCard size={12} />}>
          {data.paymentMethods.map((m) => (
            <div key={m.method} className="flex items-center justify-between py-1.5 text-sm">
              <span className="truncate pr-2" style={{ color: INK }}>
                {m.method || "Unknown"}
              </span>
              <span className="shrink-0 text-xs" style={{ color: "#8a7763" }}>
                {m.orders}× · {formatCurrency(m.revenue)}
              </span>
            </div>
          ))}
        </Card>
        <Card title="Addresses" subtitle={`${data.addresses.length} on file`} icon={<MapPin size={12} />}>
          {data.addresses.slice(0, 4).map((a, i) => (
            <div key={i} className="py-1.5 text-sm">
              <div style={{ color: INK }}>
                {[a.city, a.state].filter(Boolean).join(", ") || "—"}
              </div>
              <div className="text-xs" style={{ color: "#8a7763" }}>
                {a.pincode || "—"} · {a.count} order{a.count === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Monthly spend chart */}
      {data.monthly.length > 1 && (
        <Card title="Monthly spend" subtitle="lifetime revenue by month">
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee4d0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v) => formatCurrency(Number(v))}
                />
                <Bar dataKey="revenue" fill={ROSE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Order history */}
      <Card title="Order history" subtitle={`${data.orders.length} orders, newest first`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ background: "#f7efdf" }}>
                {["Date", "Order ID", "Flavour", "Qty", "Total", "Payment", "Status"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: INK }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o, i) => (
                <tr key={o.id} style={{ background: i % 2 === 0 ? "white" : "#fdf9f1" }}>
                  <td className="whitespace-nowrap px-3 py-2" style={{ color: INK }}>
                    {formatDateLong(o.date)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums" style={{ color: "#8a7763" }}>
                    #{o.orderId}
                  </td>
                  <td className="px-3 py-2" style={{ color: INK }}>
                    <span className="block max-w-[260px] truncate">{o.flavour}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums" style={{ color: INK }}>
                    {o.qty}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums" style={{ color: INK }}>
                    {formatCurrency(o.total)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2" style={{ color: "#8a7763" }}>
                    {o.paymentMethod || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2" style={{ color: "#8a7763" }}>
                    {o.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  caption,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: BORDER, background: CARD }}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: "#9a8571" }}>
        {icon}
        {label}
      </div>
      <p
        className="mt-1 text-lg font-bold tabular-nums"
        style={{ fontFamily: "Georgia, serif", color: INK }}
      >
        {value}
      </p>
      {caption && (
        <p className="text-[10px]" style={{ color: "#9a8571" }}>
          {caption}
        </p>
      )}
    </div>
  );
}

function Card({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: BORDER, background: CARD }}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p
          className="flex items-center gap-1.5 text-sm font-semibold"
          style={{ fontFamily: "Georgia, serif", color: INK }}
        >
          {icon}
          {title}
        </p>
        {subtitle && (
          <span className="text-[11px] italic" style={{ color: "#9a8571" }}>
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
