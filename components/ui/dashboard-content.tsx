"use client";

export function DashboardContent({ username }: { username: string }) {
  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen">
      <div className="p-8">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-neutral-500">Welcome back, {username}!</p>
      </div>
    </div>
  );
}
