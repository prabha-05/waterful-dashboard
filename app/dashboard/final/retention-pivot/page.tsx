import { RetentionPivot } from "@/components/ui/retention-pivot";

export default function RetentionPivotPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#0a0a0a" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#f5f5f5" }}>
          Pivot Cohort
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#a3a3a3" }}>
          Pull every customer who ordered between two dates, then tag whether their first / last order
          was before or after the pivot date.
        </p>
        <RetentionPivot />
      </div>
    </div>
  );
}
