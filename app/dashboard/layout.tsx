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
    <div className="flex flex-col lg:flex-row min-h-screen" style={{ background: "#07090f" }}>
      <Sidebar username={username} />
      {/* min-w-0 prevents flex items (charts/tables) from forcing horizontal overflow */}
      <main
        className="flex-1 min-h-screen min-w-0"
        style={{ background: "#07090f", color: "#e5e7eb" }}
      >
        {children}
      </main>
    </div>
  );
}
