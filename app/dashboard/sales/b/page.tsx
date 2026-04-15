import { getCustomerAndProductMetrics } from "@/lib/sales-queries";
import { SalesBContent } from "@/components/ui/sales-b-charts";

export default async function SalesBPage() {
  const data = await getCustomerAndProductMetrics();

  return (
    <div className="p-8 space-y-2">
      <h1 className="text-3xl font-bold text-neutral-900">Customers & Products</h1>
      <p className="text-neutral-500 mb-6">Analyze customer behavior and product performance.</p>
      <SalesBContent data={data} />
    </div>
  );
}
