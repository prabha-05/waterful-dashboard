"use client";

import { useCallback, useRef, useState } from "react";
import { Calendar, Download, Upload } from "lucide-react";
import * as XLSX from "xlsx";

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
  meta: {
    rowsParsed: number;
    droppedNoPhone: number;
    droppedNotDelivered: number;
    droppedOutOfWindow: number;
    customerCount: number;
  };
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

export function RetentionPivotUpload() {
  const [start, setStart] = useState<string>("2022-06-30");
  const [end, setEnd] = useState<string>(formatDate(new Date()));
  const [pivot, setPivot] = useState<string>("2026-05-01");
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async () => {
    if (!file) {
      setError("Pick the shopify_all_orders.xlsx file first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("start", start);
      fd.append("end", end);
      fd.append("pivot", pivot);
      const res = await fetch("/api/retention/pivot-upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [file, start, end, pivot]);

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const downloadExcel = () => {
    if (!data || data.customers.length === 0) return;
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
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 1 });
      const cell = ws[addr];
      if (cell) cell.t = "s";
    }
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
      {/* Upload zone */}
      <div
        className="rounded-2xl border-2 border-dashed p-5 transition-colors hover:bg-amber-50"
        style={{ background: "white", borderColor: BORDER }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${AMBER}22`, color: AMBER }}>
            <Upload size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: INK }}>
              Drop the Shopify orders Excel file here (e.g. <code>shopify_all_orders.xlsx</code>)
            </p>
            <p className="text-[12px]" style={{ color: MUTED }}>
              {file ? `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : "or click Choose file. Same export your colleague's clean_up_file.py reads."}
            </p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={{ background: AMBER, color: "white" }}
          >
            Choose file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Date controls + Run */}
      <div
        className="flex flex-wrap items-end gap-3 rounded-2xl border p-4 shadow-sm"
        style={{ background: "white", borderColor: BORDER }}
      >
        <DateField label="Start" value={start} onChange={setStart} />
        <DateField label="End" value={end} onChange={setEnd} />
        <DateField label="Pivot" value={pivot} onChange={setPivot} />
        <button
          onClick={run}
          disabled={loading || !file}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
          style={{ background: INK }}
        >
          {loading ? "Processing…" : "Pull customers"}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border p-5 text-sm" style={{ background: "white", borderColor: BORDER, color: ROSE }}>
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Summary line */}
          <div className="rounded-2xl border p-4 shadow-sm text-[12px]" style={{ background: CREAM_BG, borderColor: BORDER, color: MUTED }}>
            Parsed <span className="font-semibold" style={{ color: INK }}>{data.meta.rowsParsed.toLocaleString("en-IN")}</span> rows ·{" "}
            kept <span className="font-semibold" style={{ color: SAGE }}>{data.customers.length.toLocaleString("en-IN")}</span> unique customers (phone-deduplicated) ·{" "}
            dropped {data.meta.droppedNoPhone.toLocaleString("en-IN")} no-phone,{" "}
            {data.meta.droppedNotDelivered.toLocaleString("en-IN")} not-delivered,{" "}
            {data.meta.droppedOutOfWindow.toLocaleString("en-IN")} out-of-window
          </div>

          {/* Table */}
          <section
            className="rounded-2xl border shadow-sm"
            style={{ background: "white", borderColor: BORDER }}
          >
            <div className="flex items-start justify-between p-4 border-b" style={{ borderColor: BORDER }}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                  {data.customers.length.toLocaleString("en-IN")} customers · {data.start} → {data.end}
                </p>
                <p className="text-[11px] mt-0.5 italic" style={{ color: MUTED }}>
                  Pivot date: {data.pivot}
                </p>
              </div>
              <button
                onClick={downloadExcel}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white"
                style={{ background: "white", borderColor: BORDER, color: INK }}
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
                      { h: "Last order", align: "right" },
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
                  {data.customers.slice(0, 500).map((c) => (
                    <tr key={c.identity} className="border-t" style={{ borderColor: "#f1e7d3" }}>
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
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: INK }}>{c.lastOrderDate}</td>
                    </tr>
                  ))}
                  {data.customers.length > 500 && (
                    <tr>
                      <td colSpan={12} className="px-3 py-3 text-center text-[12px] italic" style={{ color: MUTED }}>
                        Showing first 500 of {data.customers.length.toLocaleString("en-IN")}. Use Download Excel to get the full list.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2" style={{ borderColor: BORDER }}>
      <Calendar size={14} style={{ color: AMBER }} />
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-400"
        style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
      />
    </div>
  );
}
