import { MetaAdSets } from "@/components/ui/meta-adsets";

export default function FinalMetaAdSetsPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#000000" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: "#ffffff" }}>
          Meta Ad Sets
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#9ca3af" }}>
          Audience-level performance — which audiences buy, which to scale, which to kill.
        </p>
        <MetaAdSets />
      </div>
    </div>
  );
}
