import { RetentionSingleDay } from "@/components/ui/retention-single-day";

export default function RetentionSingleDayPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#0a0a0a" }}>
      <div className="space-y-2 p-8">
        <h1
          className="text-3xl font-bold"
          style={{ color: "#f5f5f5" }}
        >
          Single Day Retention
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#a3a3a3" }}>
          All retention metrics for a single day — first timers, loyalty, and customer value at a glance.
        </p>
        <RetentionSingleDay />
      </div>
    </div>
  );
}
