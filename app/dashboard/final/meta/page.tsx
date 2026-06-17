import { MetaOverview } from "@/components/ui/meta-overview";

export default function FinalMetaPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#fdfaf4" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: "#4a3a2e" }}>
          Meta Ads
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#9a8571" }}>
          Spend, ROAS, CPA, and campaign-level performance.
        </p>
        <MetaOverview />
      </div>
    </div>
  );
}
