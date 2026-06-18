import { RetentionCustomerValue } from "@/components/ui/retention-customer-value";

export default function CustomerValuePage() {
  return (
    <div className="relative min-h-full" style={{ background: "#080d1a" }}>
      <div className="space-y-2 p-8">
        <h1
          className="text-3xl font-bold"
          style={{ color: "#ffffff" }}
        >
          Customer Value
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#94a3b8" }}>
          LTV, ARPU, and the unit economics that matter — what each customer is really worth.
        </p>
        <RetentionCustomerValue />
      </div>
    </div>
  );
}
