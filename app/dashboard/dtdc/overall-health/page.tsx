import { DtdcOverallHealth } from "@/components/ui/dtdc-overall-health";

export default function DtdcOverallHealthPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#0a0a0a" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#f5f5f5" }}>
          DTDC — Overall Health
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#a3a3a3" }}>
          Top-level DTDC delivery + tracking health, sliced by date / city / status.
        </p>
        <DtdcOverallHealth />
      </div>
    </div>
  );
}
