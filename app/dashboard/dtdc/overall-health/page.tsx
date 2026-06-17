import { DtdcOverallHealth } from "@/components/ui/dtdc-overall-health";

export default function DtdcOverallHealthPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#fdfaf4" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#4a3a2e" }}>
          DTDC — Overall Health
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#9a8571" }}>
          Top-level DTDC delivery + tracking health, sliced by date / city / status.
        </p>
        <DtdcOverallHealth />
      </div>
    </div>
  );
}
