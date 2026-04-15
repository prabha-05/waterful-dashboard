import { SalesSummary } from "@/components/ui/sales-summary";

export default function SalesSummaryPage() {
  return (
    <div className="relative min-h-full">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 0% 0%, rgba(79,70,229,0.06), transparent 40%), radial-gradient(circle at 100% 0%, rgba(14,165,233,0.06), transparent 40%), radial-gradient(circle at 50% 100%, rgba(16,185,129,0.05), transparent 50%)",
        }}
      />
      <div className="space-y-2 p-8">
        <h1 className="bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 bg-clip-text text-3xl font-bold text-transparent">
          Sales Summary
        </h1>
        <p className="mb-6 text-neutral-500">
          Pick a single day or a date range to view sales, customers, and orders.
        </p>
        <SalesSummary />
      </div>
    </div>
  );
}
