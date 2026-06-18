"use client";

import { useState } from "react";
import { Calendar, Download } from "lucide-react";
import * as XLSX from "xlsx";

const INK = "#ffffff";
const MUTED = "#94a3b8";
const AMBER = "#f97316";
const SAGE = "#10b981";
const ROSE = "#ef4444";
const BORDER = "#1e293b";
const CREAM_BG = "#0f172a";

type CustomerRow = {
  identity: string;
  name: string;
  phone: string;
  email: string | null;
  ordersInRange: number;
  lifetimeOrders: number;
  lifetimeUnits: number;
  lifetimeRevenue: number;
  firstOrderDate: string;
  lastOrderDate: string;
  firstTag: "pre" | "post";
  lastTag: "pre" | "post";
  postPivotOrders: number;
  postPivotUnits: number;
  postPivotRevenue: number;
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

function fmtInr(v: number): string {
  const n = Math.round(v);
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function nDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function RetentionPivot({
  endpoint = "/api/retention/pivot",
}: {
  // Where to fetch the cohort from. Default is the TypeScript route;
  // the Python-backed page passes "/api/retention/pivot-python".
  endpoint?: string;
} = {}) {
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
      const res = await fetch(`${endpoint}?start=${start}&end=${end}&pivot=${pivot}`);
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

  const downloadExcel = () => {
    if (!data || data.customers.length === 0) return;
    // Build an array-of-objects so XLSX preserves column order via header
    // option below. Numbers stay numeric (so Excel can sum them), strings
    // stay strings (so phones aren't munged into scientific notation).
    const rows = data.customers.map((c) => ({
      "Name": c.name,
      "Phone": c.phone || "",
      "Email": c.email ?? "",
      "Lifetime units": c.lifetimeUnits,
      "Pre-pivot units": c.lifetimeUnits - c.postPivotUnits,
      "Post-pivot units": c.postPivotUnits,
      "Lifetime revenue": Math.round(c.lifetimeRevenue),
      "Pre-pivot revenue": Math.round(c.lifetimeRevenue - c.postPivotRevenue),
      "Post-pivot revenue": Math.round(c.postPivotRevenue),
      "Orders in window": c.ordersInRange,
      "Lifetime orders": c.lifetimeOrders,
      "Pre-pivot orders": c.lifetimeOrders - c.postPivotOrders,
      "Post-pivot orders": c.postPivotOrders,
      "First order": c.firstOrderDate,
      "First vs pivot": c.firstTag,
      "Last order": c.lastOrderDate,
      "Last vs pivot": c.lastTag,
    }));
    const header = [
      "Name", "Phone", "Email",
      "Lifetime units", "Pre-pivot units", "Post-pivot units",
      "Lifetime revenue", "Pre-pivot revenue", "Post-pivot revenue",
      "Orders in window", "Lifetime orders",
      "Pre-pivot orders", "Post-pivot orders",
      "First order", "First vs pivot",
      "Last order", "Last vs pivot",
    ];
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    // Force Phone to be stored as text so leading-zero / long-digit phones
    // don't get coerced into numbers by Excel.
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 1 }); // col 1 = Phone
      const cell = ws[addr];
      if (cell) cell.t = "s";
    }
    // Reasonable column widths.
    ws["!cols"] = [
      { wch: 22 }, { wch: 14 }, { wch: 28 },
      { wch: 13 }, { wch: 14 }, { wch: 14 },
      { wch: 15 }, { wch: 16 }, { wch: 16 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pivot Cohort");
    XLSX.writeFile(wb, `pivot-cohort-${data.start}_to_${data.end}_pivot-${data.pivot}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Date pickers */}
      <div
        className="flex flex-wrap items-end gap-3 rounded-2xl border p-4 shadow-sm"
        style={{ background: "#0f172a", borderColor: BORDER }}
      >
        <DateField label="Start" value={start} max={end} onChange={setStart} />
        <DateField label="End" value={end} min={start} onChange={setEnd} />
        <DateField label="Pivot" value={pivot} onChange={setPivot} accent />
        <button
          onClick={run}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
          style={{ background: "#6366f1" }}
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
          style={{ background: "#0f172a", borderColor: BORDER, color: MUTED }}
        >
          No customers ordered in that range.
        </div>
      )}

      {/* Table */}
      {data && data.customers.length > 0 && (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "#0f172a", borderColor: BORDER }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "#1e293b", background: CREAM_BG }}
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
              onClick={downloadExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-900"
              style={{ background: "#0f172a", borderColor: BORDER, color: INK }}
            >
              <Download size={13} />
              Download Excel
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
                    { h: "Units", align: "right" },
                    { h: "Units pre / post", align: "right" },
                    { h: "Revenue", align: "right" },
                    { h: "Revenue pre / post", align: "right" },
                    { h: "In window", align: "right" },
                    { h: "Lifetime", align: "right" },
                    { h: "Pre / Post", align: "right" },
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
                  <tr key={c.identity} className="border-t" style={{ borderColor: "#1e293b" }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: INK }}>{c.name}</td>
                    <td className="px-3 py-2.5 tabular-nums" style={{ color: INK }}>{c.phone || "—"}</td>
                    <td className="px-3 py-2.5" style={{ color: INK }}>{c.email || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: INK }}>{c.lifetimeUnits}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      <span style={{ color: ROSE }}>{c.lifetimeUnits - c.postPivotUnits}</span>
                      <span style={{ color: MUTED }}> / </span>
                      <span style={{ color: SAGE }}>{c.postPivotUnits}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: INK }}>{fmtInr(c.lifetimeRevenue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      <span style={{ color: ROSE }}>{fmtInr(c.lifetimeRevenue - c.postPivotRevenue)}</span>
                      <span style={{ color: MUTED }}> / </span>
                      <span style={{ color: SAGE }}>{fmtInr(c.postPivotRevenue)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: INK }}>{c.ordersInRange}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: MUTED }}>{c.lifetimeOrders}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      <span style={{ color: ROSE }}>{c.lifetimeOrders - c.postPivotOrders}</span>
                      <span style={{ color: MUTED }}> / </span>
                      <span style={{ color: SAGE }}>{c.postPivotOrders}</span>
                    </td>
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
      style={{ background: "#0f172a", borderColor: BORDER }}
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
