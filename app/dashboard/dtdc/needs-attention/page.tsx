import { DtdcNeedsAttention } from "@/components/ui/dtdc-needs-attention";

export default function DtdcNeedsAttentionPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#fdfaf4" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#4a3a2e" }}>
          DTDC — Needs Attention
        </h1>
        <p className="mb-4 text-sm italic" style={{ color: "#9a8571" }}>
          Shipments stuck, RTOs, late deliveries — the ones to look at today.
        </p>
        <div
          className="mb-6 rounded-xl border px-4 py-3 text-[12px] leading-relaxed"
          style={{ background: "#fffaf0", borderColor: "#e8dfd0", color: "#6b5849" }}
        >
          <span className="font-semibold" style={{ color: "#4a3a2e" }}>How this updates:</span>{" "}
          Covers every DTDC shipment booked from <span className="font-semibold">May 1, 2026</span> onwards.
          DTDC tracking syncs once a day at <span className="font-semibold">04:00 IST</span>, so
          counts refresh each morning — once an AWB is marked <span className="italic">Delivered</span> or{" "}
          <span className="italic">RTO Delivered</span> by DTDC, it drops out of these tiles automatically.
        </div>
        <DtdcNeedsAttention />
      </div>
    </div>
  );
}
