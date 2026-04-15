"use client";

export function DashboardContent({ username }: { username: string }) {
  return (
    <div className="flex-1 bg-neutral-50 min-h-screen">
      <div className="p-8">
        <h1 className="text-3xl font-bold text-neutral-900">Dashboard</h1>
        <p className="mt-1 text-neutral-500">Welcome back, {username}!</p>
      </div>
    </div>
  );
}
