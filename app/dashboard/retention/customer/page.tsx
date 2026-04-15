import { CustomerCohortInfo, PAPER } from "@/components/ui/customer-cohort-info";
import { CustomerLookup } from "@/components/ui/customer-lookup";

export default function CustomerPage() {
  return (
    <div className="relative min-h-full" style={{ background: PAPER }}>
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 0% 0%, rgba(217,119,119,0.08), transparent 45%), radial-gradient(circle at 100% 0%, rgba(122,148,113,0.08), transparent 45%), radial-gradient(circle at 50% 100%, rgba(201,153,84,0.06), transparent 50%)",
        }}
      />
      <div className="p-8">
        <div className="mb-6">
          <p
            className="text-xs uppercase tracking-[0.3em]"
            style={{ color: "#c99954", fontFamily: "Georgia, serif" }}
          >
            The Customer Ledger
          </p>
          <h1
            className="mt-1 text-4xl font-bold"
            style={{ fontFamily: "Georgia, serif", color: "#4a3a2e" }}
          >
            Customer
          </h1>
          <p className="mt-2 text-sm italic" style={{ color: "#8a7763" }}>
            A quiet record of who we met, when, and what they first brought home.
          </p>
        </div>
        <div className="space-y-6">
          <CustomerLookup />
          <CustomerCohortInfo />
        </div>
      </div>
    </div>
  );
}
