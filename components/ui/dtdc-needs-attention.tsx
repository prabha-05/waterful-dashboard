"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download } from "lucide-react";

const INK = "#4a3a2e";
const MUTED = "#9a8571";
const AMBER = "#c99954";
const SAGE = "#7a9471";
const ROSE = "#d97777";
const BLUE = "#7c8bb2";
const BORDER = "#e8dfd0";
const CREAM_BG = "#faf6ef";

type AttentionShipment = {
  awb: string;
  refNo: string | null;
  city: string | null;
  phone: string | null;
  ageDays: number | null;
  reason: string | null;
  status: string | null;
  attempts: number;
};

type AttentionPayload = {
  asOf: string;
  failedFirstAttempt: { count: number; rows: AttentionShipment[] };
  agedInTransit: { count: number; rows: AttentionShipment[] };
  fourPlusAttempts: { count: number; rows: AttentionShipment[] };
  rtoAwaiting: { count: number; rows: AttentionShipment[] };
};

type TileId = "failedFirstAttempt" | "agedInTransit" | "fourPlusAttempts" | "rtoAwaiting";

const TILES: { id: TileId; title: string; subtitle: string; color: string; bg: string }[] = [
  { id: "failedFirstAttempt", title: "Failed 1st attempt only", subtitle: "call & rescue fast", color: BLUE, bg: `${BLUE}1f` },
  { id: "agedInTransit", title: "Aged in-transit >5d", subtitle: "RTO risk", color: ROSE, bg: `${ROSE}1f` },
  { id: "fourPlusAttempts", title: "4+ attempts", subtitle: "cost leak", color: AMBER, bg: `${AMBER}1f` },
  { id: "rtoAwaiting", title: "RTO approve-awaited", subtitle: "your decision", color: MUTED, bg: CREAM_BG },
];

export function DtdcNeedsAttention() {
  const [data, setData] = useState<AttentionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TileId>("failedFirstAttempt");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch("/api/dtdc/needs-attention")
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<AttentionPayload>;
      })
      .then((d) => {
        if (!cancel) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const tileRows = useMemo(() => {
    if (!data) return [] as AttentionShipment[];
    return data[selected].rows;
  }, [data, selected]);

  const selectedTile = TILES.find((t) => t.id === selected);

  const downloadCsv = () => {
    if (tileRows.length === 0) return;
    const header = ["AWB", "Ref", "City", "Phone", "Age (days)", "Status", "Attempts", "Reason"];
    const rows = tileRows.map((r) => [
      r.awb,
      r.refNo ?? "",
      r.city ?? "",
      r.phone ?? "",
      r.ageDays ?? "",
      r.status ?? "",
      r.attempts,
      r.reason ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dtdc-${selected}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} style={{ color: AMBER }} />
          <h2 className="text-sm font-bold" style={{ color: INK }}>
            1 · Needs attention now
          </h2>
          <span className="text-[12px] italic" style={{ color: MUTED }}>
            live & unfiltered — always anchored to today
          </span>
        </div>
        {data && (
          <span className="text-[11px]" style={{ color: MUTED }}>
            as of {new Date(data.asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <p className="text-[12px] -mt-3" style={{ color: MUTED }}>
        Not affected by the filters below · click a tile to load it into the action table.
      </p>

      {/* 4 tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TILES.map((t) => {
          const active = t.id === selected;
          const count = data ? data[t.id].count : null;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className="text-left rounded-2xl border p-4 shadow-sm transition-transform hover:translate-y-[-1px]"
              style={{
                background: t.bg,
                borderColor: active ? t.color : `${t.color}55`,
                boxShadow: active ? `0 0 0 2px ${t.color}55` : undefined,
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.color }}>
                {t.title}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color: INK }}>
                {count == null ? "—" : count}
              </p>
              <p className="text-[11px]" style={{ color: MUTED }}>
                {t.subtitle}
              </p>
            </button>
          );
        })}
      </div>

      {/* Action list */}
      <div
        className="rounded-2xl border shadow-sm overflow-hidden"
        style={{ background: "white", borderColor: BORDER }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: BORDER, background: CREAM_BG }}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
              Action list — {selectedTile?.title.toLowerCase()}
            </p>
            <p className="text-[11px] italic mt-0.5" style={{ color: MUTED }}>
              {loading
                ? "loading…"
                : tileRows.length === 0
                ? "no shipments in this cohort right now"
                : `${tileRows.length} row${tileRows.length === 1 ? "" : "s"} · click a row for full remark trail`}
            </p>
          </div>
          <button
            onClick={downloadCsv}
            disabled={tileRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 hover:bg-white"
            style={{ background: "white", borderColor: BORDER, color: INK }}
          >
            <Download size={13} />
            Export view
          </button>
        </div>

        {error && (
          <div className="px-4 py-6 text-sm" style={{ color: ROSE }}>
            Failed to load: {error}
          </div>
        )}

        {!error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: CREAM_BG }}>
                  {["AWB", "Ref", "City", "Phone", "Age", "Reason"].map((h, i) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{
                        color: MUTED,
                        textAlign: i === 4 ? "right" : "left",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tileRows.map((r) => (
                  <tr
                    key={r.awb}
                    className="border-t cursor-pointer transition-colors hover:bg-amber-50/40"
                    style={{ borderColor: "#f1e7d3" }}
                    onClick={() => window.alert(`Remark trail for ${r.awb} — coming soon`)}
                  >
                    <td className="px-4 py-2.5 font-mono text-[12px]" style={{ color: INK }}>
                      {r.awb}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: INK }}>{r.refNo ?? "—"}</td>
                    <td className="px-4 py-2.5" style={{ color: INK }}>{r.city ?? "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums" style={{ color: INK }}>{r.phone ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: INK }}>
                      {r.ageDays == null ? "—" : `${r.ageDays}d`}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: MUTED }}>{r.reason ?? "—"}</td>
                  </tr>
                ))}
                {!loading && tileRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm italic" style={{ color: MUTED }}>
                      Nothing in this cohort right now. ✨
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-2 border-t text-[11px] italic" style={{ borderColor: BORDER, color: MUTED, background: CREAM_BG }}>
          … one row per shipment · sortable · row click → full remark trail
        </div>
      </div>
    </div>
  );
}
