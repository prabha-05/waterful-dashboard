"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, MapPin, Filter, Heart } from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const BLUE = "#7c8bb2";
const BORDER = "#e8dfd0";
const CREAM_BG = "#faf6ef";

type HealthPayload = {
  filters: { from: string | null; to: string | null; city: string | null; status: string | null };
  empty: boolean;
  total?: number;
  statusMix?: {
    delivered: number;
    inTransit: number;
    booked: number;
    notDelivered: number;
    rto: number;
    reattemptInitiated: number;
  };
  deliveryKpis?: {
    deliveredPct: number;
    onTimeSlaPct: number | null;
    firstAttemptPct: number | null;
    rtoPct: number;
    ndrRecoveryPct: number | null;
  };
  speedCost?: {
    avgTransit: number | null;
    pickupLag: number | null;
    costPerDelivered: number | null;
    rtoCostMonth: number | null;
    totalShipments: number;
  };
  funnel?: { booked: number; shipped: number; delivered: number };
  transitSpread?: Record<string, number>;
  weeklyVolume?: { week: string; booked: number; delivered: number }[];
  cityPerformance?: { city: string; total: number; deliveredPct: number; avgTransit: number | null }[];
  failureReasons?: { label: string; count: number }[];
};

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}
function fmtDays(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}d`;
}
function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("en-IN");
}

export function DtdcOverallHealth() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const url = useMemo(() => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (city) q.set("city", city);
    if (status) q.set("status", status);
    const qs = q.toString();
    return `/api/dtdc/overall-health${qs ? `?${qs}` : ""}`;
  }, [from, to, city, status]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((d: HealthPayload) => {
        if (!cancel) setData(d);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [url]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Heart size={16} style={{ color: SAGE }} />
        <h2 className="text-sm font-bold" style={{ color: INK }}>2 · Overall health</h2>
        <span className="text-[12px] italic" style={{ color: MUTED }}>
          filters below reshape this section only
        </span>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm"
        style={{ background: "white", borderColor: BORDER }}
      >
        <FilterInput label="From" icon={<Calendar size={13} style={{ color: AMBER }} />}>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
          />
        </FilterInput>
        <FilterInput label="To">
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
          />
        </FilterInput>
        <FilterInput label="City" icon={<MapPin size={13} style={{ color: BLUE }} />}>
          <input
            type="text"
            value={city}
            placeholder="e.g. MUMBAI"
            onChange={(e) => setCity(e.target.value)}
            className="rounded-lg border px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-400 w-32"
            style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
          />
        </FilterInput>
        <FilterInput label="Status" icon={<Filter size={13} style={{ color: MUTED }} />}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
          >
            <option value="">All</option>
            <option value="Delivered">Delivered</option>
            <option value="In Transit">In Transit</option>
            <option value="Out For Delivery">Out For Delivery</option>
            <option value="RTO Initiated">RTO Initiated</option>
            <option value="RTO Delivered">RTO Delivered</option>
            <option value="Not Delivered">Not Delivered</option>
          </select>
        </FilterInput>
        {(from || to || city || status) && (
          <button
            onClick={() => { setFrom(""); setTo(""); setCity(""); setStatus(""); }}
            className="text-[11px] underline ml-2"
            style={{ color: MUTED }}
          >
            clear all
          </button>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border p-8 text-center text-sm italic" style={{ background: "white", borderColor: BORDER, color: MUTED }}>
          Loading…
        </div>
      )}

      {!loading && data?.empty && (
        <div className="rounded-2xl border p-8 text-center text-sm italic" style={{ background: "white", borderColor: BORDER, color: MUTED }}>
          No shipments match the current filters.
        </div>
      )}

      {!loading && !data?.empty && data && (
        <>
          {/* Status mix — top of the page, matches DTDC's customer-portal
              "Booking vs Delivered" 6-category split exactly. */}
          <Card title="Status mix">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <StatusTile label="Delivered" value={data.statusMix!.delivered} color={SAGE} />
              <StatusTile label="In transit / OFD" value={data.statusMix!.inTransit} color={BLUE} />
              <StatusTile label="Booked / prepared" value={data.statusMix!.booked} color={AMBER} />
              <StatusTile label="Not delivered" value={data.statusMix!.notDelivered} color={ROSE} />
              <StatusTile label="RTO" value={data.statusMix!.rto} color={ROSE} />
              <StatusTile label="Reattempt initiated" value={data.statusMix!.reattemptInitiated} color={AMBER} />
            </div>
          </Card>

          {/* Delivery KPIs */}
          <SectionLabel>Delivery KPIs</SectionLabel>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <KpiTile label="Delivered (dispatched)" value={fmtPct(data.deliveryKpis!.deliveredPct)} color={SAGE} />
            <KpiTile label="On-time SLA %" value={fmtPct(data.deliveryKpis!.onTimeSlaPct)} color={SAGE} />
            <KpiTile label="1st-attempt success" value={fmtPct(data.deliveryKpis!.firstAttemptPct)} color={SAGE} />
            <KpiTile label="RTO rate" value={fmtPct(data.deliveryKpis!.rtoPct)} color={ROSE} />
            <KpiTile label="NDR recovery" value={fmtPct(data.deliveryKpis!.ndrRecoveryPct)} color={AMBER} />
          </div>

          {/* Speed */}
          <SectionLabel>Speed</SectionLabel>
          <div className="grid gap-3 grid-cols-3">
            <KpiTile label="Avg transit" value={fmtDays(data.speedCost!.avgTransit)} color={INK} />
            <KpiTile label="Pickup lag" value={fmtDays(data.speedCost!.pickupLag)} color={INK} />
            <KpiTile label="Total shipments" value={fmtNum(data.speedCost!.totalShipments)} color={INK} />
          </div>

          {/* Charts row */}
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
            <Card title="Weekly volume & delivered">
              <WeeklyBars data={data.weeklyVolume!} />
            </Card>
            <Card title="Funnel">
              <Funnel data={data.funnel!} />
              <p className="mt-3 text-[10px]" style={{ color: MUTED }}>booked → shipped → delivered</p>
            </Card>
            <Card title="Transit-time spread">
              <TransitSpread data={data.transitSpread!} />
            </Card>
          </div>

          {/* Lists row */}
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            <Card title="Performance by city">
              <CityList rows={data.cityPerformance!} />
            </Card>
            <Card title="Failure reasons">
              <ReasonList rows={data.failureReasons!} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/* ────────── small helpers / building blocks ────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
      {children}
    </p>
  );
}

function FilterInput({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-2 py-1" style={{ borderColor: BORDER }}>
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
      {children}
    </div>
  );
}

function KpiTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl border p-3 shadow-sm" style={{ background: CREAM_BG, borderColor: BORDER }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>{title}</p>
      {children}
    </div>
  );
}

function WeeklyBars({ data }: { data: { week: string; booked: number; delivered: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.booked));
  return (
    <div className="flex items-end justify-between gap-2 h-32">
      {data.map((d) => {
        const h = Math.max(6, (d.booked / max) * 100);
        const deliveredH = Math.max(0, (d.delivered / max) * 100);
        const label = new Date(d.week).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        return (
          <div key={d.week} className="flex flex-col items-center flex-1 min-w-0">
            <div className="relative w-full max-w-[28px]" style={{ height: 100 }}>
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t"
                style={{ height: `${h}%`, background: `${BLUE}55` }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t"
                style={{ height: `${deliveredH}%`, background: BLUE }}
              />
            </div>
            <span className="mt-1 text-[9px] text-center leading-tight" style={{ color: MUTED }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Funnel({ data }: { data: { booked: number; shipped: number; delivered: number } }) {
  const max = data.booked || 1;
  const rows = [
    { label: "booked", value: data.booked, color: `${BLUE}55` },
    { label: "shipped", value: data.shipped, color: BLUE },
    { label: "delivered", value: data.delivered, color: SAGE },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: "#f1f1f1" }}>
            <div className="h-full rounded-md" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </div>
          <span className="text-xs font-bold tabular-nums w-12 text-right" style={{ color: INK }}>{r.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function TransitSpread({ data }: { data: Record<string, number> }) {
  const keys = ["1d", "2d", "3d", "4d", "5d", "6d+"];
  const max = Math.max(1, ...keys.map((k) => data[k] ?? 0));
  const BAR_AREA = 100; // pixel height of the bar canvas
  return (
    <div className="flex items-end justify-between gap-2">
      {keys.map((k) => {
        const v = data[k] ?? 0;
        const h = v > 0 ? Math.max(6, (v / max) * BAR_AREA) : 4;
        const isPeak = v > 0 && v === max;
        return (
          <div key={k} className="flex flex-col items-center flex-1 min-w-0">
            <span className="text-[10px] font-semibold tabular-nums leading-none mb-1" style={{ color: INK }}>
              {v}
            </span>
            <div
              className="w-full max-w-[28px] rounded-t"
              style={{ height: `${h}px`, background: isPeak ? SAGE : `${BLUE}55` }}
              title={`${k}: ${v}`}
            />
            <span className="mt-1.5 text-[9px]" style={{ color: MUTED }}>{k}</span>
          </div>
        );
      })}
    </div>
  );
}

function CityList({ rows }: { rows: { city: string; total: number; deliveredPct: number; avgTransit: number | null }[] }) {
  if (rows.length === 0) return <p className="text-xs italic" style={{ color: MUTED }}>no city data</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const pctColor = r.deliveredPct >= 85 ? SAGE : r.deliveredPct >= 75 ? AMBER : ROSE;
        return (
          <div key={r.city} className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium truncate" style={{ color: INK }}>{r.city}</span>
            <span className="tabular-nums shrink-0" style={{ color: pctColor }}>
              <span className="font-bold">{r.deliveredPct.toFixed(0)}%</span>
              <span className="text-neutral-400"> · {fmtDays(r.avgTransit)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ReasonList({ rows }: { rows: { label: string; count: number }[] }) {
  if (rows.length === 0) return <p className="text-xs italic" style={{ color: MUTED }}>no failures recorded</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        // Visualize severity with simple dots; up to 4 dots based on share of max.
        const dots = Math.max(1, Math.min(4, Math.round((r.count / max) * 4)));
        return (
          <div key={r.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-neutral-700 truncate">{r.label}</span>
            <span className="tabular-nums shrink-0">
              {"●".repeat(dots).split("").map((c, i) => (
                <span key={i} style={{ color: ROSE }}>{c}</span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatusTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: `${color}11`, borderColor: `${color}33` }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>{value.toLocaleString()}</p>
    </div>
  );
}
