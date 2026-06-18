import { getCustomerAndProductMetrics } from "@/lib/sales-queries";
import { SalesBContent } from "@/components/ui/sales-b-charts";

export default async function SalesBPage() {
  const data = await getCustomerAndProductMetrics();

  return (
    <div className="p-8 space-y-2">
      <h1 className="text-3xl font-bold text-white">Customers & Products</h1>
      <p className="text-slate-400 mb-6">Analyze customer behavior and product performance.</p>
      <SalesBContent data={data} />
    </div>
  );
}
