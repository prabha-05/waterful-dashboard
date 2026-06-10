import { RetentionPivot } from "@/components/ui/retention-pivot";

export default function RetentionPivotPythonPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#fdfaf4" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#4a3a2e" }}>
          Pivot Cohort · Python
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#9a8571" }}>
          Same cohort as the regular Pivot page, computed by{" "}
          <span style={{ fontFamily: "monospace", color: "#4a3a2e" }}>retention_pivot.py</span>{" "}
          (Python). Cancelled and RTO orders are excluded; phone numbers are
          normalised to 10 digits.
        </p>
        <RetentionPivot endpoint="/api/retention/pivot-python" />
      </div>
    </div>
  );
}
