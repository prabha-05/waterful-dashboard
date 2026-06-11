import { RetentionPivotUpload } from "@/components/ui/retention-pivot-upload";

export default function RetentionPivotUploadPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#fdfaf4" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#4a3a2e" }}>
          Pivot Cohort · Upload
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#9a8571" }}>
          Drop your <code>shopify_all_orders.xlsx</code> (the same file
          your colleague's <code>clean_up_file.py</code> reads) and the dashboard
          will apply the exact same logic: phone-deduplicated, fulfilled-only,
          RTO orders excluded.
        </p>
        <RetentionPivotUpload />
      </div>
    </div>
  );
}
