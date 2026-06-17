import { AmazonSales } from "@/components/ui/amazon-sales";

export default function AmazonSalesPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#0a0a0a" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#f5f5f5" }}>
          Amazon — Sales
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#a3a3a3" }}>
          Daily revenue, units sold, and year-over-year comparison from your Amazon Seller Central exports.
        </p>
        <AmazonSales />
      </div>
    </div>
  );
}
