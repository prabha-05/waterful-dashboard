import { AmazonSales } from "@/components/ui/amazon-sales";

export default function AmazonSalesPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#080d1a" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#ffffff" }}>
          Amazon — Sales
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#94a3b8" }}>
          Daily revenue, units sold, and year-over-year comparison from your Amazon Seller Central exports.
        </p>
        <AmazonSales />
      </div>
    </div>
  );
}
