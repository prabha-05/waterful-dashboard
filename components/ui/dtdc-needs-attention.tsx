"use client";

import { useEffect, useState } from "react";
import { Clock, Download, RotateCcw, Package, Repeat, AlertTriangle } from "lucide-react";

const INK = "#ffffff";
const MUTED = "#94a3b8";
const AMBER = "#f97316";
const SAGE = "#10b981";
const ROSE = "#ef4444";
const BORDER = "#1e293b";

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

type Bucket = { count: number; rows: AttentionShipment[] };
type ListBucket = {
  total: number;
  breakdown: { label: string; count: number }[];
  rows: AttentionShipment[];
};

type Payload = {
  asOf: string;
  ageingOpen: {
    tenPlus: Bucket;
    sixToTen: Bucket;
    threeToFive: Bucket;
    zeroToTwo: Bucket;
  };
  actionRequired: {
    rtoApproveAwaited: Bucket;
    preparedNotCollected: Bucket;
    bookedNotMoving: Bucket;
  };
  fieldFailures: {
    failedByReason: ListBucket;
    rtoPipeline: ListBucket;
    multiAttempt: ListBucket;
  };
};

function csvFromRows(rows: AttentionShipment[]): string {
  const header = ["AWB", "Ref", "City", "Phone", "Age (days)", "Status", "Attempts", "Reason"];
  const body = rows.map((r) => [
    r.awb,
    r.refNo ?? "",
    r.city ?? "",
    r.phone ?? "",
    r.ageDays ?? "",
    r.status ?? "",
    r.attempts,
    r.reason ?? "",
  ]);
  return [header, ...body]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}
function downloadCsv(rows: AttentionShipment[], filename: string) {
  if (rows.length === 0) return;
  const csv = csvFromRows(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function DtdcNeedsAttention() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch("/api/dtdc/needs-attention")
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<Payload>;
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

  if (loading) {
    return (
      <div className="rounded-2xl border p-8 text-center text-sm italic" style={{ background: "#0f172a", borderColor: BORDER, color: MUTED }}>
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border p-6 text-sm" style={{ background: "#0f172a", borderColor: BORDER, color: ROSE }}>
        Failed to load: {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* ───────── Ageing open shipments ───────── */}
      <Section
        icon={<Clock size={16} style={{ color: ROSE }} />}
        title="Ageing open shipments"
        rows={[
          ...data.ageingOpen.tenPlus.rows,
          ...data.ageingOpen.sixToTen.rows,
          ...data.ageingOpen.threeToFive.rows,
          ...data.ageingOpen.zeroToTwo.rows,
        ]}
        filename="dtdc-ageing-all"
      >
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <AgeingTile count={data.ageingOpen.tenPlus.count} label="10+ days · escalate" tint={ROSE} severe />
          <AgeingTile count={data.ageingOpen.sixToTen.count} label="6–10 days · chase" tint={ROSE} />
          <AgeingTile count={data.ageingOpen.threeToFive.count} label="3–5 days · watch" tint={AMBER} />
          <AgeingTile count={data.ageingOpen.zeroToTwo.count} label="0–2 days · ok" tint={SAGE} />
        </div>
      </Section>

      {/* ───────── Action required ───────── */}
      <SectionHeader label="Action required" />
      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        <ActionCard
          icon={<RotateCcw size={16} style={{ color: AMBER }} />}
          title="RTO approve awaited"
          tag={{ label: "action on Waterful", color: AMBER }}
          bucket={data.actionRequired.rtoApproveAwaited}
          body="Waiting on your approval to return. Parcel frozen until actioned."
          filename="dtdc-rto-approve-awaited"
        />
        <ActionCard
          icon={<Package size={16} style={{ color: ROSE }} />}
          title="Prepared — not collected"
          tag={{ label: "action on Waterful", color: AMBER }}
          extraTag={{ label: "2+ days", color: MUTED }}
          bucket={data.actionRequired.preparedNotCollected}
          body="Manifested but not handed to DTDC. Verify dispatch has physically tendered."
          filename="dtdc-prepared-not-collected"
        />
        <ActionCard
          icon={<Package size={16} style={{ color: ROSE }} />}
          title="Booked — not moving"
          tag={{ label: "action on DTDC", color: ROSE }}
          extraTag={{ label: "2+ days", color: MUTED }}
          bucket={data.actionRequired.bookedNotMoving}
          body="Scanned in but not inducted into the network. Escalate to DTDC account manager."
          filename="dtdc-booked-not-moving"
        />
      </div>

      {/* ───────── Field failures ───────── */}
      <SectionHeader label="Field failures" />
      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        <ListCard
          icon={<AlertTriangle size={16} style={{ color: ROSE }} />}
          title="Failed by reason"
          bucket={data.fieldFailures.failedByReason}
          filename="dtdc-failed-by-reason"
        />
        <ListCard
          icon={<RotateCcw size={16} style={{ color: ROSE }} />}
          title="RTO pipeline"
          bucket={data.fieldFailures.rtoPipeline}
          filename="dtdc-rto-pipeline"
        />
        <ListCard
          icon={<Repeat size={16} style={{ color: AMBER }} />}
          title="Multi-attempt"
          bucket={data.fieldFailures.multiAttempt}
          footer="live pipeline only"
          filename="dtdc-multi-attempt"
        />
      </div>
    </div>
  );
}

/* ────────── building blocks ────────── */

function Section({
  icon,
  title,
  children,
  rows,
  filename,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  rows: AttentionShipment[];
  filename: string;
}) {
  return (
    <div className="rounded-2xl border p-5 shadow-sm" style={{ background: "#0f172a", borderColor: BORDER }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-bold" style={{ color: INK }}>{title}</h2>
        </div>
        <DownloadBtn rows={rows} filename={filename} />
      </div>
      {children}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
      {label}
    </p>
  );
}

function AgeingTile({
  count,
  label,
  tint,
  severe,
}: {
  count: number;
  label: string;
  tint: string;
  severe?: boolean;
}) {
  // Severe = 10+ days. Stronger border + fill.
  const bg = severe ? `${tint}26` : `${tint}14`;
  const border = severe ? `${tint}80` : `${tint}40`;
  return (
    <div
      className="rounded-xl border p-4 transition-transform"
      style={{ background: bg, borderColor: border }}
    >
      <p className="text-3xl font-bold tabular-nums" style={{ color: tint }}>{count}</p>
      <p className="text-[11px] mt-1" style={{ color: MUTED }}>{label}</p>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  tag,
  extraTag,
  bucket,
  body,
  filename,
}: {
  icon: React.ReactNode;
  title: string;
  tag: { label: string; color: string };
  extraTag?: { label: string; color: string };
  bucket: Bucket;
  body: string;
  filename: string;
}) {
  return (
    <div className="rounded-2xl border p-5 shadow-sm space-y-3" style={{ background: "#0f172a", borderColor: BORDER }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <h3 className="text-sm font-bold truncate" style={{ color: INK }}>{title}</h3>
        </div>
        <DownloadBtn rows={bucket.rows} filename={filename} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tag {...tag} />
        {extraTag && <Tag {...extraTag} />}
      </div>
      <p className="text-3xl font-bold tabular-nums" style={{ color: AMBER }}>{bucket.count}</p>
      <p className="text-[12px]" style={{ color: MUTED }}>{body}</p>
    </div>
  );
}

function ListCard({
  icon,
  title,
  bucket,
  footer,
  filename,
}: {
  icon: React.ReactNode;
  title: string;
  bucket: ListBucket;
  footer?: string;
  filename: string;
}) {
  return (
    <div className="rounded-2xl border p-5 shadow-sm space-y-3" style={{ background: "#0f172a", borderColor: BORDER }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <h3 className="text-sm font-bold truncate" style={{ color: INK }}>{title}</h3>
        </div>
        <DownloadBtn rows={bucket.rows} filename={filename} />
      </div>
      <p className="text-3xl font-bold tabular-nums" style={{ color: ROSE }}>{bucket.total}</p>
      {bucket.breakdown.length === 0 ? (
        <p className="text-[12px] italic" style={{ color: MUTED }}>no entries</p>
      ) : (
        <div className="space-y-1.5">
          {bucket.breakdown.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-[13px]">
              <span style={{ color: INK }}>{r.label}</span>
              <span className="tabular-nums font-semibold" style={{ color: MUTED }}>{r.count}</span>
            </div>
          ))}
        </div>
      )}
      {footer && <p className="text-[11px] italic" style={{ color: MUTED }}>{footer}</p>}
    </div>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: `${color}22`, color }}
    >
      {label}
    </span>
  );
}

function DownloadBtn({ rows, filename }: { rows: AttentionShipment[]; filename: string }) {
  return (
    <button
      onClick={() => downloadCsv(rows, filename)}
      disabled={rows.length === 0}
      className="rounded-md border p-1.5 transition-colors disabled:opacity-40 hover:bg-orange-950/30"
      style={{ background: "#0f172a", borderColor: BORDER, color: INK }}
      title={`Download ${rows.length} row${rows.length === 1 ? "" : "s"} as CSV`}
    >
      <Download size={13} />
    </button>
  );
}
