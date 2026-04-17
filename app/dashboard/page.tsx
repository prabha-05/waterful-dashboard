import { auth } from "@/lib/auth";
import { DashboardOverview } from "@/components/ui/dashboard-overview";

export default async function DashboardPage() {
  const session = await auth();
  const username = session?.user?.name || "User";

  return (
    <div className="relative min-h-full" style={{ background: "#fdfaf4" }}>
      <div className="space-y-2 p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#4a3a2e" }}>
          Dashboard
        </h1>
        <p className="mb-6 text-sm italic" style={{ color: "#9a8571" }}>
          Welcome back, {username} — here&apos;s how your business is performing.
        </p>
        <DashboardOverview />
      </div>
    </div>
  );
}
