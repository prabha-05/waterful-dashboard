import { RetentionFinal } from "@/components/ui/retention-final";

export default function FinalRetentionPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#fdfaf4" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#4a3a2e" }}>
          Retention
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#9a8571" }}>
          Who came back, how often, and what they spent.
        </p>
        <RetentionFinal />
      </div>
    </div>
  );
}
