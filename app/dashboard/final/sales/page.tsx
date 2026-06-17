import { SalesSummary } from "@/components/ui/sales-summary";

export default function FinalSalesPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#000000" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#ffffff" }}>
          Final — Sales
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#9ca3af" }}>
          Pick a date to view that day&apos;s sales, customers, and orders.
        </p>
        <SalesSummary />
      </div>
    </div>
  );
}
