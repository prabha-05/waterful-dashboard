import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  const username = session?.user?.name || "User";

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-neutral-900">Dashboard</h1>
      <p className="mt-1 text-neutral-500">Welcome back, {username}!</p>
    </div>
  );
}
