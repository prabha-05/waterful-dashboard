"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, MapPin } from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const BLUE = "#7c8bb2";
const BORDER = "#e8dfd0";
const CREAM_BG = "#faf6ef";

type HistTier = "green" | "amber" | "orange" | "red";
type Family = "delivered" | "pipeline" | "failed" | "rtoProgress" | "rtoComplete";

type Payload = {
  totalShipments: number;
  citiesBreakdown: {
    rows: { city: string; closed: number; delivered: number; rto: number; failed: number; deliveryRate: number }[];
  };
  topCitiesByVolume: {
    total: number;
    rows: { city: string; count: number; pct: number }[];
  };
  deliveryTimeHistogram: {
    totalDelivered: number;
    buckets: { label: string; count: number; pct: number; tier: HistTier }[];
  };
  failureReasons: {
    total: number;
    rows: { label: string; count: number; pct: number }[];
  };
  partnership: {
    filters: { from: string | null; to: string | null; city: string | null };
    cities: string[];
    totalShipments: number;
    statusDistribution: { label: string; count: number; pct: number; family: Family }[];
  };
};

const HIST_COLOR: Record<HistTier, string> = { green: SAGE, amber: AMBER, orange: "#d48642", red: ROSE };
const FAMILY_COLOR: Record<Family, string> = {
  delivered: SAGE,
  pipeline: BLUE,
  failed: ROSE,
  rtoProgress: AMBER,
  rtoComplete: MUTED,
};
const FAMILY_LABEL: Record<Family, string> = {
  delivered: "Delivered",
  pipeline: "In pipeline",
  failed: "Failed / non-delivered",
  rtoProgress: "RTO progress",
  rtoComplete: "RTO complete",
};

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function DtdcOverallHealth() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [city, setCity] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const url = useMemo(() => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (city) q.set("city", city);
    const qs = q.toString();
    return `/api/dtdc/overall-health${qs ? `?${qs}` : ""}`;
  }, [from, to, city]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((d: Payload) => {
        if (!cancel) setData(d);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [url]);

  if (loading || !data) {
    return (
      <div className="rounded-2xl border p-8 text-center text-sm italic" style={{ background: "white", borderColor: BORDER, color: MUTED }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─────── Section 1 — Partnership health ─────── */}
      <SectionHeader title="Section 1 — Partnership health" />

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
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-lg border px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: CREAM_BG, minWidth: 120 }}
          >
            <option value="">All cities</option>
            {data.partnership.cities.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </select>
        </FilterInput>
        {(from || to || city) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setCity("");
            }}
            className="text-[11px] underline ml-1"
            style={{ color: MUTED }}
          >
            clear all
          </button>
        )}
        <span className="text-[10px] italic ml-auto" style={{ color: MUTED }}>
          date applies to the whole page · city scopes Status distribution only
        </span>
      </div>

      <StatusDistributionCard total={data.partnership.totalShipments} rows={data.partnership.statusDistribution} />

      {/* ─────── Section 2 — Network performance ─────── */}
      <SectionHeader title="Section 2 — Network performance" subtitle={`${data.totalShipments.toLocaleString("en-IN")} shipments in the selected date range, across all cities`} />

      <DeliveryTimeHistogram totalDelivered={data.deliveryTimeHistogram.totalDelivered} buckets={data.deliveryTimeHistogram.buckets} />

      <FailureReasonsCard total={data.failureReasons.total} rows={data.failureReasons.rows} />

      <TopVolumeCard rows={data.topCitiesByVolume.rows} total={data.topCitiesByVolume.total} />

      <CityBreakdownTable rows={data.citiesBreakdown.rows} />
    </div>
  );
}

/* ───────── building blocks ───────── */

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-base font-bold" style={{ color: INK }}>{title}</h2>
      {subtitle && (
        <p className="text-[12px] italic" style={{ color: MUTED }}>{subtitle}</p>
      )}
    </div>
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

function CityBreakdownTable({ rows }: { rows: Payload["citiesBreakdown"]["rows"] }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm overflow-x-auto" style={{ background: "white", borderColor: BORDER }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
        City performance · min 5 closed · worst delivery rate first
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left" style={{ color: INK }}>
            <th className="py-2 px-3 font-semibold">City</th>
            <th className="py-2 px-3 font-semibold text-right">Closed</th>
            <th className="py-2 px-3 font-semibold text-right">Delivered</th>
            <th className="py-2 px-3 font-semibold text-right">RTO</th>
            <th className="py-2 px-3 font-semibold text-right">Failed</th>
            <th className="py-2 px-3 font-semibold text-right">Delivery rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.city} className="border-t" style={{ borderColor: BORDER }}>
              <td className="py-2.5 px-3" style={{ color: INK }}>{titleCase(r.city)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: INK }}>{r.closed}</td>
              <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: SAGE }}>{r.delivered}</td>
              <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: AMBER }}>{r.rto}</td>
              <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: ROSE }}>{r.failed}</td>
              <td className="py-2.5 px-3 text-right tabular-nums font-semibold" style={{ color: INK }}>
                {r.deliveryRate.toFixed(1)}%
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-[12px] italic" style={{ color: MUTED }}>
                No cities with 5+ closed shipments yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TopVolumeCard({ rows, total }: { rows: Payload["topCitiesByVolume"]["rows"]; total: number }) {
  const max = rows[0]?.count || 1;
  return (
    <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: MUTED }}>
        Top 10 cities by shipment volume
      </p>
      <p className="text-[10px] mb-3" style={{ color: MUTED }}>
        % of total {total.toLocaleString("en-IN")}
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.city} className="flex items-center gap-2 text-[12px]">
            <div className="w-24 truncate text-right" style={{ color: INK }}>
              {titleCase(r.city)}
            </div>
            <div className="flex-1 relative h-5 rounded" style={{ background: `${BLUE}14` }}>
              <div
                className="absolute top-0 left-0 bottom-0 rounded"
                style={{ width: `${(r.count / max) * 100}%`, background: BLUE }}
              />
            </div>
            <div className="w-24 text-right tabular-nums" style={{ color: INK }}>
              {r.count.toLocaleString("en-IN")}{" "}
              <span style={{ color: MUTED }}>({r.pct.toFixed(1)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeliveryTimeHistogram({ totalDelivered, buckets }: { totalDelivered: number; buckets: Payload["deliveryTimeHistogram"]["buckets"] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const BAR_AREA = 160;
  return (
    <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          Delivery time histogram
        </p>
        <p className="text-[10px]" style={{ color: MUTED }}>
          {totalDelivered.toLocaleString("en-IN")} delivered shipments
        </p>
      </div>
      <div className="flex gap-3 text-[10px] mb-4" style={{ color: MUTED }}>
        <LegendDot color={HIST_COLOR.green} label="≤3 days (on time)" />
        <LegendDot color={HIST_COLOR.amber} label="4–5 days" />
        <LegendDot color={HIST_COLOR.orange} label="6–7 days" />
        <LegendDot color={HIST_COLOR.red} label="8+ days" />
      </div>
      <div className="flex items-end justify-between gap-3" style={{ height: BAR_AREA + 50 }}>
        {buckets.map((b) => {
          const h = (b.count / max) * BAR_AREA;
          return (
            <div key={b.label} className="flex flex-col items-center flex-1 min-w-0">
              <div className="text-center mb-1" style={{ color: HIST_COLOR[b.tier] }}>
                <div className="text-base font-bold tabular-nums leading-tight">{b.count}</div>
                <div className="text-[10px]" style={{ color: MUTED }}>{b.pct.toFixed(1)}%</div>
              </div>
              <div
                className="w-full max-w-[44px] rounded-t transition-all"
                style={{ height: Math.max(6, h), background: HIST_COLOR[b.tier] }}
              />
              <div className="mt-2 text-[11px]" style={{ color: MUTED }}>
                {b.label === "8+" ? "8+ days" : `${b.label} day${b.label === "1" ? "" : "s"}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FailureReasonsCard({ total, rows }: { total: number; rows: Payload["failureReasons"]["rows"] }) {
  const max = rows[0]?.count || 1;
  return (
    <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          RTO / failure reasons
        </p>
        <p className="text-[10px]" style={{ color: MUTED }}>
          {total.toLocaleString("en-IN")} cases
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] italic" style={{ color: MUTED }}>No failure reasons recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 text-[12px]">
              <div className="w-40 truncate text-right" style={{ color: INK }}>
                {r.label}
              </div>
              <div className="flex-1 relative h-5 rounded" style={{ background: `${ROSE}14` }}>
                <div
                  className="absolute top-0 left-0 bottom-0 rounded"
                  style={{ width: `${(r.count / max) * 100}%`, background: ROSE }}
                />
              </div>
              <div className="w-24 text-right tabular-nums" style={{ color: INK }}>
                {r.count}{" "}
                <span style={{ color: MUTED }}>({r.pct.toFixed(1)}%)</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDistributionCard({ total, rows }: { total: number; rows: Payload["partnership"]["statusDistribution"] }) {
  const max = rows[0]?.count || 1;
  const families: Family[] = ["delivered", "pipeline", "failed", "rtoProgress", "rtoComplete"];
  return (
    <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: BORDER }}>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          Status distribution
        </p>
        <p className="text-[10px]" style={{ color: MUTED }}>
          {total.toLocaleString("en-IN")} shipments
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] italic py-4 text-center" style={{ color: MUTED }}>
          No shipments match the current filters.
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 text-[12px]">
              <div className="w-40 truncate text-right" style={{ color: INK }}>
                {r.label}
              </div>
              <div className="flex-1 relative h-5 rounded" style={{ background: `${FAMILY_COLOR[r.family]}14` }}>
                <div
                  className="absolute top-0 left-0 bottom-0 rounded"
                  style={{ width: `${(r.count / max) * 100}%`, background: FAMILY_COLOR[r.family] }}
                />
              </div>
              <div className="w-24 text-right tabular-nums" style={{ color: INK }}>
                {r.count.toLocaleString("en-IN")}{" "}
                <span style={{ color: MUTED }}>({r.pct.toFixed(1)}%)</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-3 pt-3 border-t text-[10px]" style={{ borderColor: BORDER, color: MUTED }}>
        {families.map((f) => (
          <LegendDot key={f} color={FAMILY_COLOR[f]} label={FAMILY_LABEL[f]} />
        ))}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}
