"use client";

import { useState } from "react";
import { Calendar, Download } from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const BORDER = "#e8dfd0";
const CREAM_BG = "#faf6ef";

type CustomerRow = {
  identity: string;
  name: string;
  phone: string;
  email: string | null;
  ordersInRange: number;
  lifetimeOrders: number;
  firstOrderDate: string;
  lastOrderDate: string;
  firstTag: "pre" | "post";
  lastTag: "pre" | "post";
  postPivotOrders: number;
};

type Response = {
  start: string;
  end: string;
  pivot: string;
  customers: CustomerRow[];
};

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function RetentionPivot() {
  // Sensible defaults: window = last 30 days, pivot = today.
  const [start, setStart] = useState<string>(formatDate(nDaysAgo(30)));
  const [end, setEnd] = useState<string>(formatDate(new Date()));
  const [pivot, setPivot] = useState<string>(formatDate(new Date()));
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/retention/pivot?start=${start}&end=${end}&pivot=${pivot}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!data || data.customers.length === 0) return;
    const header = [
      "Name", "Phone", "Email",
      "Orders in window", "Lifetime orders",
      "First order", "First vs pivot",
      "Last order", "Last vs pivot",
    ];
    const rows = data.customers.map((c) => [
      c.name, c.phone, c.email ?? "",
      c.ordersInRange, c.lifetimeOrders,
      c.firstOrderDate, c.firstTag,
      c.lastOrderDate, c.lastTag,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pivot-cohort-${data.start}_to_${data.end}_pivot-${data.pivot}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Date pickers */}
      <div
        className="flex flex-wrap items-end gap-3 rounded-2xl border p-4 shadow-sm"
        style={{ background: "white", borderColor: BORDER }}
      >
        <DateField label="Start" value={start} max={end} onChange={setStart} />
        <DateField label="End" value={end} min={start} onChange={setEnd} />
        <DateField label="Pivot" value={pivot} onChange={setPivot} accent />
        <button
          onClick={run}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
          style={{ background: INK }}
        >
          {loading ? "Loading…" : "Pull customers"}
        </button>
      </div>

      {error && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ background: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" }}
        >
          {error}
        </div>
      )}

      {/* Summary stats */}
      {data && data.customers.length > 0 && (
        <SummaryStats data={data} />
      )}

      {/* Empty state */}
      {data && data.customers.length === 0 && !loading && (
        <div
          className="rounded-2xl border p-8 text-center text-sm italic"
          style={{ background: "white", borderColor: BORDER, color: MUTED }}
        >
          No customers ordered in that range.
        </div>
      )}

      {/* Table */}
      {data && data.customers.length > 0 && (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "white", borderColor: BORDER }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "#f1e7d3", background: CREAM_BG }}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                {data.customers.length} customer{data.customers.length === 1 ? "" : "s"} · {data.start} → {data.end}
              </p>
              <p className="text-[11px] mt-0.5 italic" style={{ color: MUTED }}>
                Pivot date: {data.pivot}
              </p>
            </div>
            <button
              onClick={downloadCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white"
              style={{ background: "white", borderColor: BORDER, color: INK }}
            >
              <Download size={13} />
              Download CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: CREAM_BG }}>
                  {[
                    { h: "Name", align: "left" },
                    { h: "Phone", align: "left" },
                    { h: "Email", align: "left" },
                    { h: "In window", align: "right" },
                    { h: "Lifetime", align: "right" },
                    { h: "First order", align: "right" },
                    { h: "vs pivot", align: "left" },
                    { h: "Last order", align: "right" },
                    { h: "vs pivot", align: "left" },
                  ].map(({ h, align }, i) => (
                    <th
                      key={i}
                      className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: MUTED, textAlign: align as "left" | "right" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr key={c.identity} className="border-t" style={{ borderColor: "#f1e7d3" }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: INK }}>{c.name}</td>
                    <td className="px-3 py-2.5 tabular-nums" style={{ color: INK }}>{c.phone || "—"}</td>
                    <td className="px-3 py-2.5" style={{ color: INK }}>{c.email || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: INK }}>{c.ordersInRange}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: MUTED }}>{c.lifetimeOrders}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>{c.firstOrderDate}</td>
                    <td className="px-3 py-2.5"><PrePostBadge tag={c.firstTag} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>{c.lastOrderDate}</td>
                    <td className="px-3 py-2.5"><PrePostBadge tag={c.lastTag} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  min,
  max,
  accent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Calendar size={14} style={{ color: accent ? AMBER : MUTED }} />
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
        />
      </div>
    </div>
  );
}

function PrePostBadge({ tag }: { tag: "pre" | "post" }) {
  const isPre = tag === "pre";
  const color = isPre ? ROSE : SAGE;
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: `${color}22`, color }}
    >
      {isPre ? "Pre" : "Post"}
    </span>
  );
}

function SummaryStats({ data }: { data: Response }) {
  // Quadrant counts: (first pre/post) × (last pre/post). Plus a separate
  // "repeat after post" count for customers with 2+ lifetime orders on/after
  // the pivot date.
  let oldLapsed = 0; // first pre, last pre
  let oldRetained = 0; // first pre, last post
  let newOnly = 0; // first post, last post
  let repeatAfterPost = 0; // postPivotOrders >= 2
  for (const c of data.customers) {
    if (c.firstTag === "pre" && c.lastTag === "pre") oldLapsed++;
    else if (c.firstTag === "pre" && c.lastTag === "post") oldRetained++;
    else if (c.firstTag === "post" && c.lastTag === "post") newOnly++;
    if (c.postPivotOrders >= 2) repeatAfterPost++;
  }
  const total = data.customers.length;
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <StatCard label="Old + retained" tagline="first pre · last post" value={oldRetained} total={total} color={SAGE} />
      <StatCard label="Old + lapsed" tagline="first pre · last pre" value={oldLapsed} total={total} color={ROSE} />
      <StatCard label="New" tagline="first post · last post" value={newOnly} total={total} color={AMBER} />
      <StatCard label="Repeat after post" tagline="2+ orders on/after pivot" value={repeatAfterPost} total={total} color={SAGE} />
    </div>
  );
}

function StatCard({
  label, tagline, value, total, color,
}: {
  label: string; tagline: string; value: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className="rounded-2xl border p-4 shadow-sm"
      style={{ background: "white", borderColor: BORDER }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
      <p className="text-[10px] italic mt-0.5" style={{ color: MUTED }}>{tagline}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
        <span className="ml-2 text-sm font-semibold" style={{ color: MUTED }}>({pct}%)</span>
      </p>
    </div>
  );
}
