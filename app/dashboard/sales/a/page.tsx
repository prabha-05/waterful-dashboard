import { getRevenueAndOrderMetrics } from "@/lib/sales-queries";
import { SalesAContent } from "@/components/ui/sales-a-charts";

export default async function SalesAPage() {
  const data = await getRevenueAndOrderMetrics();

  return (
    <div className="p-8 space-y-2">
      <h1 className="text-3xl font-bold text-white">Revenue & Orders</h1>
      <p className="text-slate-400 mb-6">Track revenue performance and order status.</p>
      <SalesAContent data={data} />
    </div>
  );
}
