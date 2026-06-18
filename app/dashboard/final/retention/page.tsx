import { RetentionFinal } from "@/components/ui/retention-final";

export default function FinalRetentionPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#080d1a" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#ffffff" }}>
          Retention
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#94a3b8" }}>
          Who came back, how often, and what they spent.
        </p>
        <RetentionFinal />
      </div>
    </div>
  );
}
