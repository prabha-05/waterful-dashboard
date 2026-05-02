import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/ui/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const username = session.user.name || "User";

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar username={username} />
      {/* min-w-0 prevents flex items (charts/tables) from forcing horizontal overflow */}
      <main className="flex-1 bg-neutral-50 min-h-screen min-w-0">
        {children}
      </main>
    </div>
  );
}
