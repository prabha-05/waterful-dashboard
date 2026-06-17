"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Upload, IndianRupee, Package, TrendingUp, TrendingDown, Download } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const INK = "#f5f5f5";
const MUTED = "#a3a3a3";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const BLUE = "#7c8bb2";
const BORDER = "#262626";
const CREAM_BG = "#171717";

type Daily = {
  date: string;
  revenue: number;
  units: number;
  yoyRevenue: number | null;
  yoyUnits: number | null;
};

type Payload = {
  window: { from: string; to: string };
  totals: {
    revenue: number;
    units: number;
    yoyRevenue: number;
    yoyUnits: number;
    yoyRevenuePct: number | null;
    yoyUnitsPct: number | null;
    avgOrderValue: number;
  };
  daily: Daily[];
  meta: {
    lastUploadedAt: string | null;
    daysWithData: number;
  };
};

function fmtInr(v: number): string {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function fmtNum(v: number): string {
  return v.toLocaleString("en-IN");
}

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
}
function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

type Preset = "today" | "yesterday" | "last7" | "last30" | "custom";

export function AmazonSales() {
  const [preset, setPreset] = useState<Preset>("last7");
  const [from, setFrom] = useState(nDaysAgo(7));
  const [to, setTo] = useState(yesterday());
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Set the date range whenever a preset is picked.
  useEffect(() => {
    if (preset === "today") {
      const t = ymd(new Date());
      setFrom(t);
      setTo(t);
    } else if (preset === "yesterday") {
      const y = yesterday();
      setFrom(y);
      setTo(y);
    } else if (preset === "last7") {
      setFrom(nDaysAgo(7));
      setTo(yesterday());
    } else if (preset === "last30") {
      setFrom(nDaysAgo(30));
      setTo(yesterday());
    }
  }, [preset]);

  const url = useMemo(() => `/api/amazon/sales?from=${from}&to=${to}`, [from, to]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Payload) => setData(d))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Payload) => { if (!cancel) setData(d); })
      .catch((e: unknown) => { if (!cancel) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [url]);

  return (
    <div className="space-y-6">
      {/* ───── Upload zone ───── */}
      <UploadCard onUploaded={reload} />

      {/* ───── Filter bar ───── */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm"
        style={{ background: "#171717", borderColor: BORDER }}
      >
        <PresetChip active={preset === "today"} onClick={() => setPreset("today")}>Today</PresetChip>
        <PresetChip active={preset === "yesterday"} onClick={() => setPreset("yesterday")}>Yesterday</PresetChip>
        <PresetChip active={preset === "last7"} onClick={() => setPreset("last7")}>Last 7 days</PresetChip>
        <PresetChip active={preset === "last30"} onClick={() => setPreset("last30")}>Last 30 days</PresetChip>
        <PresetChip active={preset === "custom"} onClick={() => setPreset("custom")}>Custom</PresetChip>

        <div className="inline-flex items-center gap-1.5 rounded-xl border bg-neutral-900 px-2 py-1" style={{ borderColor: BORDER }}>
          <Calendar size={13} style={{ color: AMBER }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>From</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }}
            className="rounded-lg border px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
          />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-xl border bg-neutral-900 px-2 py-1" style={{ borderColor: BORDER }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>To</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => { setTo(e.target.value); setPreset("custom"); }}
            className="rounded-lg border px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
          />
        </div>

        {data && (
          <span className="ml-auto text-[11px] italic" style={{ color: MUTED }}>
            {data.meta.daysWithData} day{data.meta.daysWithData === 1 ? "" : "s"} with data
            {data.meta.lastUploadedAt && (
              <> · last upload {new Date(data.meta.lastUploadedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</>
            )}
          </span>
        )}
      </div>

      {/* ───── KPI tiles ───── */}
      {loading && !data && (
        <div className="rounded-2xl border p-8 text-center text-sm italic" style={{ background: "#171717", borderColor: BORDER, color: MUTED }}>
          Loading…
        </div>
      )}
      {error && (
        <div className="rounded-2xl border p-5 text-sm" style={{ background: "#171717", borderColor: BORDER, color: ROSE }}>
          Failed to load: {error}
        </div>
      )}
      {data && !loading && data.daily.length === 0 && (
        <div className="rounded-2xl border p-8 text-center text-sm italic" style={{ background: "#171717", borderColor: BORDER, color: MUTED }}>
          No Amazon data for this range yet. Upload a Sales Dashboard CSV that covers these dates.
        </div>
      )}
      {data && data.daily.length > 0 && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <KpiTile
              label="Revenue"
              value={fmtInr(data.totals.revenue)}
              icon={<IndianRupee size={14} />}
              color={INK}
              yoyPct={data.totals.yoyRevenuePct}
            />
            <KpiTile
              label="Units sold"
              value={fmtNum(data.totals.units)}
              icon={<Package size={14} />}
              color={INK}
              yoyPct={data.totals.yoyUnitsPct}
            />
            <KpiTile
              label="Avg sale value"
              value={fmtInr(data.totals.avgOrderValue)}
              icon={<IndianRupee size={14} />}
              color={INK}
            />
            <KpiTile
              label="Same period last year"
              value={fmtInr(data.totals.yoyRevenue)}
              icon={<TrendingUp size={14} />}
              color={MUTED}
              sublabel={`${fmtNum(data.totals.yoyUnits)} units`}
            />
          </div>

          <DailyBars rows={data.daily} />
          <DailyTable rows={data.daily} />
        </>
      )}
    </div>
  );
}

/* ────────── pieces ────────── */

function PresetChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
      style={{
        background: active ? AMBER : `${AMBER}18`,
        color: active ? "white" : INK,
      }}
    >
      {children}
    </button>
  );
}

function KpiTile({
  label,
  value,
  icon,
  color,
  yoyPct,
  sublabel,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  yoyPct?: number | null;
  sublabel?: string;
}) {
  const up = yoyPct != null && yoyPct >= 0;
  return (
    <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "#171717", borderColor: BORDER }}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
        <span style={{ color: AMBER }}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
      {sublabel && (
        <p className="mt-1 text-[11px]" style={{ color: MUTED }}>{sublabel}</p>
      )}
      {yoyPct != null && (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: up ? SAGE : ROSE }}>
          {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {up ? "+" : ""}{yoyPct.toFixed(1)}% YoY
        </p>
      )}
    </div>
  );
}

function DailyBars({ rows }: { rows: Daily[] }) {
  // Three series on one chart with two y-axes — revenue & AOV share the
  // left ₹ axis, units use a right count axis.
  const series = rows.map((r) => ({
    date: r.date,
    label: new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    revenue: r.revenue,
    units: r.units,
    aov: r.units > 0 ? Math.round(r.revenue / r.units) : 0,
  }));

  return (
    <div className="rounded-2xl border p-5 shadow-sm" style={{ background: "#171717", borderColor: BORDER }}>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          Daily Amazon performance
        </p>
        <div className="flex gap-3 text-[10px]" style={{ color: MUTED }}>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3" style={{ background: AMBER }} />
            Revenue (₹)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3" style={{ background: SAGE }} />
            AOV (₹)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3" style={{ background: BLUE }} />
            Units sold
          </span>
        </div>
      </div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} stroke={BORDER} />
            <YAxis
              yAxisId="rupees"
              orientation="left"
              tick={{ fill: MUTED, fontSize: 11 }}
              stroke={BORDER}
              tickFormatter={(v: number) => fmtInr(v)}
            />
            <YAxis
              yAxisId="units"
              orientation="right"
              tick={{ fill: MUTED, fontSize: 11 }}
              stroke={BORDER}
              allowDecimals={false}
            />
            <Tooltip content={<DailyTooltip />} />
            <Line
              yAxisId="rupees"
              type="monotone"
              dataKey="revenue"
              stroke={AMBER}
              strokeWidth={2.5}
              dot={{ fill: AMBER, r: 3 }}
              activeDot={{ r: 5 }}
              name="Revenue"
            />
            <Line
              yAxisId="rupees"
              type="monotone"
              dataKey="aov"
              stroke={SAGE}
              strokeWidth={2}
              dot={{ fill: SAGE, r: 3 }}
              activeDot={{ r: 5 }}
              name="AOV"
            />
            <Line
              yAxisId="units"
              type="monotone"
              dataKey="units"
              stroke={BLUE}
              strokeWidth={2}
              dot={{ fill: BLUE, r: 3 }}
              activeDot={{ r: 5 }}
              name="Units"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DailyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const get = (key: string) => payload.find((p) => p.dataKey === key)?.value ?? 0;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-[11px] shadow-sm"
      style={{ background: "#171717", borderColor: BORDER }}
    >
      <p className="font-bold mb-1" style={{ color: INK }}>{label}</p>
      <div className="space-y-0.5">
        <p style={{ color: AMBER }}>
          Revenue: <span className="font-semibold tabular-nums">{fmtInr(Number(get("revenue")))}</span>
        </p>
        <p style={{ color: SAGE }}>
          AOV: <span className="font-semibold tabular-nums">{fmtInr(Number(get("aov")))}</span>
        </p>
        <p style={{ color: BLUE }}>
          Units: <span className="font-semibold tabular-nums">{Number(get("units"))}</span>
        </p>
      </div>
    </div>
  );
}

function downloadDailyCsv(rows: Daily[]) {
  if (rows.length === 0) return;
  const header = ["Date", "Revenue (INR)", "Units", "AOV (INR)"];
  const body = rows.map((r) => {
    const aov = r.units > 0 ? Math.round(r.revenue / r.units) : "";
    return [r.date, r.revenue, r.units, aov];
  });
  const csv = [header, ...body]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `amazon-daily-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function DailyTable({ rows }: { rows: Daily[] }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm overflow-x-auto" style={{ background: "#171717", borderColor: BORDER }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          Daily breakdown
        </p>
        <button
          onClick={() => downloadDailyCsv(rows)}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 hover:bg-amber-950/30"
          style={{ background: "#171717", borderColor: BORDER, color: INK }}
          title={`Download ${rows.length} row${rows.length === 1 ? "" : "s"} as CSV`}
        >
          <Download size={12} />
          Download CSV
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: INK }}>
            <th className="text-left py-2 px-3 font-semibold">Date</th>
            <th className="text-right py-2 px-3 font-semibold">Revenue</th>
            <th className="text-right py-2 px-3 font-semibold">Units</th>
            <th className="text-right py-2 px-3 font-semibold">AOV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const aov = r.units > 0 ? r.revenue / r.units : null;
            return (
              <tr key={r.date} className="border-t" style={{ borderColor: BORDER }}>
                <td className="py-2 px-3" style={{ color: INK }}>
                  {new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", weekday: "short" })}
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-semibold" style={{ color: INK }}>
                  {fmtInr(r.revenue)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums" style={{ color: INK }}>{r.units}</td>
                <td className="py-2 px-3 text-right tabular-nums" style={{ color: aov != null ? INK : MUTED }}>
                  {aov != null ? fmtInr(aov) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UploadCard({ onUploaded }: { onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; rowsParsed: number; inserted: number; updated: number; dateRange: { from: string; to: string }; totals: { revenue: number; units: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/amazon/sales/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setResult(j);
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [onUploaded]);

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) upload(f);
  };

  return (
    <div
      className="rounded-2xl border-2 border-dashed p-5 transition-colors hover:bg-amber-950/30"
      style={{ background: "#171717", borderColor: BORDER }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${AMBER}22`, color: AMBER }}>
          <Upload size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: INK }}>
            Upload today&rsquo;s Amazon Sales Dashboard CSV
          </p>
          <p className="text-[12px]" style={{ color: MUTED }}>
            Drag &amp; drop the file here, or click to choose. Re-uploads overwrite by date — safe to upload daily.
          </p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
          style={{ background: AMBER, color: "white" }}
        >
          {busy ? "Uploading…" : "Choose file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>
      {result && (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: `${SAGE}14`, color: SAGE }}
        >
          ✓ Parsed {result.rowsParsed} day{result.rowsParsed === 1 ? "" : "s"} ({result.dateRange.from} → {result.dateRange.to}) ·{" "}
          {result.inserted} new, {result.updated} updated · ₹{Math.round(result.totals.revenue).toLocaleString("en-IN")} / {result.totals.units} units
        </div>
      )}
      {error && (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: `${ROSE}14`, color: ROSE }}
        >
          Upload failed: {error}
        </div>
      )}
    </div>
  );
}
