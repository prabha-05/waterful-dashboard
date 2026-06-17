import { RetentionLoyalty } from "@/components/ui/retention-loyalty";

export default function LoyaltyPage() {
  return (
    <div className="relative min-h-full" style={{ background: "#07090f" }}>
      <div className="space-y-2 p-8">
        <h1
          className="text-3xl font-bold"
          style={{ color: "#ffffff" }}
        >
          Loyalty
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#90a1b9" }}>
          The ones who came back — retention rate, repeat frequency, and the funnel.
        </p>
        <RetentionLoyalty />
      </div>
    </div>
  );
}
