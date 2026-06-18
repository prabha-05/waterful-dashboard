import { RetentionFirstTimers } from "@/components/ui/retention-first-timers";

export default function FirstTimersPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#080d1a" }}>
      <div className="space-y-2 p-8">
        <h1
          className="text-3xl font-bold"
          style={{ color: "#ffffff" }}
        >
          First Timers
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#94a3b8" }}>
          The newcomers — how many showed up and what they spent on day one.
        </p>
        <RetentionFirstTimers />
      </div>
    </div>
  );
}
