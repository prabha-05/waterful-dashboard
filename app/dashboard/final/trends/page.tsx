import { auth } from "@/lib/auth";
import { DashboardOverview } from "@/components/ui/dashboard-overview";

export default async function FinalTrendsPage() {
  const session = await auth();
  const username = session?.user?.name || "User";

  return (
    <div className="relative min-h-full" style={{ background: "#0a0a0a" }}>
      <div className="space-y-2 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: "#f5f5f5" }}>
          Trends
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#a3a3a3" }}>
          Welcome back, {username} — here&apos;s how your business is performing.
        </p>
        <DashboardOverview />
      </div>
    </div>
  );
}
