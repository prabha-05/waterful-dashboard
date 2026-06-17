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
    <div className="flex flex-col lg:flex-row min-h-screen bg-black">
      <Sidebar username={username} />
      {/* min-w-0 prevents flex items (charts/tables) from forcing horizontal overflow */}
      <main className="flex-1 bg-black min-h-screen min-w-0 text-white relative">
        {/* Rainbow accent strip — brand mark at the top of every page */}
        <div
          className="sticky top-0 z-20 h-[2px] w-full"
          style={{
            background:
              "linear-gradient(90deg, #ff2b2b 0%, #ff8a00 18%, #ffd400 36%, #22c55e 54%, #22c5ff 72%, #a855f7 100%)",
          }}
          aria-hidden="true"
        />
        {children}
      </main>
    </div>
  );
}
