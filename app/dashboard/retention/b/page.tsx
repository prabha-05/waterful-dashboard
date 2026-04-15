import { getCustomerLifetimeMetrics } from "@/lib/retention-queries";
import { RetentionBContent } from "@/components/ui/retention-b-charts";

export default async function RetentionBPage() {
  const data = await getCustomerLifetimeMetrics();

  return (
    <div className="p-8 space-y-2">
      <h1 className="text-3xl font-bold text-neutral-900">Customer Lifetime</h1>
      <p className="text-neutral-500 mb-6">Analyze customer lifetime value and purchase frequency.</p>
      <RetentionBContent data={data} />
    </div>
  );
}
