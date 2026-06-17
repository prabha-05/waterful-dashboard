import { RetentionAnalytics } from "@/components/ui/retention-analytics";

export default function FinalRetentionAnalyticsPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#000000" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#ffffff" }}>
          Retention Analytics
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#9ca3af" }}>
          Cohort behaviour, churn, win-back, product &amp; geography — the full retention picture.
        </p>
        <RetentionAnalytics />
      </div>
    </div>
  );
}
