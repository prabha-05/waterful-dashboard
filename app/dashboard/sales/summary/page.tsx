import { SalesSummary } from "@/components/ui/sales-summary";

export default function SalesSummaryPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#080d1a" }}>
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 0% 0%, rgba(99,102,241,0.10), transparent 40%), radial-gradient(circle at 100% 0%, rgba(34,197,255,0.06), transparent 40%), radial-gradient(circle at 50% 100%, rgba(16,185,129,0.04), transparent 50%)",
        }}
      />
      <div className="space-y-2 p-8">
        <h1 className="bg-gradient-to-r from-white via-indigo-300 to-white bg-clip-text text-3xl font-bold text-transparent">
          Sales Summary
        </h1>
        <p className="mb-6 text-slate-400">
          Pick a date to view that day&apos;s sales, customers, and orders.
        </p>
        <SalesSummary />
      </div>
    </div>
  );
}
