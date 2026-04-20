import { SalesSummary } from "@/components/ui/sales-summary";

export default function FinalSalesPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#fdfaf4" }}>
      <div className="space-y-2 p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#4a3a2e" }}>
          Final — Sales
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#9a8571" }}>
          Pick a date to view that day&apos;s sales, customers, and orders.
        </p>
        <SalesSummary />
      </div>
    </div>
  );
}
