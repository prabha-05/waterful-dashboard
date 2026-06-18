"use client";

import { useEffect, useState } from "react";

// Shared diagnostic panel — explains why a given day's numbers look the way
// they do by comparing against the previous day. Fetches /api/sales/day-diagnostic
// on demand and caches the result for the date so re-opening doesn't refetch.

type DayReason = { tone: "good" | "warn" | "bad" | "neutral"; headline: string; detail: string };
type DayDiagnostic = {
  date: string;
  prevDate: string;
  verdict: { tone: "good" | "warn" | "bad" | "neutral"; label: string };
  current: { orders: number; net: number; pending: number };
  previous: { orders: number; net: number; pending: number };
  meta: { current: { spend: number; purchases: number; roas: number }; previous: { spend: number; purchases: number; roas: number } };
  reasons: DayReason[];
};

function toneColor(t: "good" | "warn" | "bad" | "neutral") {
  return t === "good" ? "#10b981" : t === "warn" ? "#22c5ff" : t === "bad" ? "#ef4444" : "#a3a3a3";
}
function fmtInr(v: number) {
  return `Rs.${Math.round(v).toLocaleString("en-IN")}`;
}

export function DayDiagnostic({ date }: { date: string }) {
  const [data, setData] = useState<DayDiagnostic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/sales/day-diagnostic?date=${date}`)
      .then((r) => r.json())
      .then((d: DayDiagnostic) => {
        if (cancelled) return;
        setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (loading) {
    return (
      <div
        className="rounded-2xl border p-4 text-sm italic"
        style={{ background: "#171717", borderColor: "#262626", color: "#a3a3a3" }}
      >
        Analysing {date} vs the previous day…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div
        className="rounded-2xl border p-4 text-sm italic"
        style={{ background: "#171717", borderColor: "#262626", color: "#a3a3a3" }}
      >
        Could not load diagnostic.
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border p-5 space-y-4 shadow-sm"
      style={{ background: "#171717", borderColor: "#262626" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-bold" style={{ color: "#f5f5f5" }}>
            Why this day looked like this
          </h3>
          <span
            className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: toneColor(data.verdict.tone), color: "white" }}
          >
            {data.verdict.label}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: "#a3a3a3" }}>
          {data.date} vs {data.prevDate}
        </span>
      </div>

      {/* Snapshot tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SnapStat label="Orders" cur={data.current.orders} prev={data.previous.orders} />
        <SnapStat label="Net revenue" cur={data.current.net} prev={data.previous.net} fmt={fmtInr} />
        <SnapStat
          label="Meta-attributed (Pixel)"
          cur={data.meta.current.purchases}
          prev={data.meta.previous.purchases}
          extra={`ROAS ${data.meta.previous.roas.toFixed(2)}x → ${data.meta.current.roas.toFixed(2)}x`}
        />
      </div>

      {/* Reasons */}
      {data.reasons.length === 0 ? (
        <p className="text-[12px] italic" style={{ color: "#a3a3a3" }}>
          Nothing material stood out — this day was within normal variance vs the previous day.
        </p>
      ) : (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#a3a3a3" }}>
            Top reasons
          </p>
          <ul className="space-y-2">
            {data.reasons.map((r, i) => {
              const c = toneColor(r.tone);
              return (
                <li
                  key={i}
                  className="rounded-lg border p-3 flex gap-3"
                  style={{ background: `${c}10`, borderColor: `${c}55` }}
                >
                  <span className="inline-block h-2 w-2 mt-1.5 rounded-full shrink-0" style={{ background: c }} />
                  <div className="min-w-0">
                    <p className="font-semibold text-[13px]" style={{ color: c }}>
                      {r.headline}
                    </p>
                    <p className="text-[12px] mt-0.5" style={{ color: "#f5f5f5" }}>
                      {r.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SnapStat({
  label,
  cur,
  prev,
  fmt,
  extra,
}: {
  label: string;
  cur: number;
  prev: number;
  fmt?: (v: number) => string;
  extra?: string;
}) {
  const format = fmt ?? ((v: number) => v.toLocaleString("en-IN"));
  const delta = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
  const deltaColor = Math.abs(delta) < 1 ? "#a3a3a3" : delta > 0 ? "#10b981" : "#ef4444";
  return (
    <div className="rounded-lg border p-3" style={{ background: "#fafaf7", borderColor: "#262626" }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "#a3a3a3" }}>{label}</p>
      <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: "#f5f5f5" }}>{format(cur)}</p>
      <p className="text-[11px] tabular-nums" style={{ color: "#a3a3a3" }}>
        vs {format(prev)}{" "}
        {prev > 0 && (
          <span style={{ color: deltaColor }} className="font-semibold">
            ({delta > 0 ? "+" : ""}{delta.toFixed(0)}%)
          </span>
        )}
      </p>
      {extra && <p className="text-[10px] mt-1" style={{ color: "#a3a3a3" }}>{extra}</p>}
    </div>
  );
}
