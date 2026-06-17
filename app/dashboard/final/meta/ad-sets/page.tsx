import { MetaAdSets } from "@/components/ui/meta-adsets";

export default function FinalMetaAdSetsPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#0a0a0a" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: "#f5f5f5" }}>
          Meta Ad Sets
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#a3a3a3" }}>
          Audience-level performance — which audiences buy, which to scale, which to kill.
        </p>
        <MetaAdSets />
      </div>
    </div>
  );
}
