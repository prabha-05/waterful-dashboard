import { RetentionSingleDay } from "@/components/ui/retention-single-day";

export default function RetentionSingleDayPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#080d1a" }}>
      <div className="space-y-2 p-8">
        <h1
          className="text-3xl font-bold"
          style={{ color: "#ffffff" }}
        >
          Single Day Retention
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#94a3b8" }}>
          All retention metrics for a single day — first timers, loyalty, and customer value at a glance.
        </p>
        <RetentionSingleDay />
      </div>
    </div>
  );
}
