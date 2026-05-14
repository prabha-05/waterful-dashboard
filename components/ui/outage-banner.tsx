import { AlertTriangle } from "lucide-react";

// Temporary banner shown across the dashboard while Neon's free-tier compute
// quota is exhausted (May 14 → June 1, 2026). Surfaces last-known numbers
// from our most recent successful queries so the UI isn't completely empty.
// Remove this banner (and its <OutageBanner /> usage in layout) once the
// database is back online or migrated.
export function OutageBanner() {
  return (
    <div className="border-b bg-amber-50/80 border-amber-200">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-amber-900">
              Dashboard data temporarily offline · Neon free-tier compute quota
              reached
            </p>
            <p className="mt-1 text-amber-800/90">
              The database is suspended until the monthly quota resets on{" "}
              <span className="font-semibold">June 1, 2026</span>. Live numbers
              will return then. Recent snapshot from May 9, 2026:
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-xs">
              <KpiPill label="Total Sales (May 9)" value="₹45,141" />
              <KpiPill label="Orders (May 9)" value="36" />
              <KpiPill label="Confirmed" value="33" />
              <KpiPill label="Cancelled" value="3" />
              <KpiPill label="Meta spend (last 7d)" value="₹1,57,414" />
              <KpiPill label="Active ads" value="30" />
              <KpiPill label="Top discount" value="ZERO15 · ₹27.3K" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-amber-900 ring-1 ring-amber-200">
      <span className="text-[10px] uppercase tracking-wider text-amber-700/80">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}
