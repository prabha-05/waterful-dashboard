import { RetentionLoyalty } from "@/components/ui/retention-loyalty";

export default function LoyaltyPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#0a0a0a" }}>
      <div className="space-y-2 p-8">
        <h1
          className="text-3xl font-bold"
          style={{ color: "#f5f5f5" }}
        >
          Loyalty
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#a3a3a3" }}>
          The ones who came back — retention rate, repeat frequency, and the funnel.
        </p>
        <RetentionLoyalty />
      </div>
    </div>
  );
}
