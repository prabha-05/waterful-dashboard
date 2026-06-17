export default function DashboardHomePage() {
  return (
    <div className="relative min-h-full" style={{ background: "#0a0a0a" }}>
      <div className="space-y-3 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#f5f5f5" }}>
          Dashboard
        </h1>
        <p className="text-sm italic" style={{ color: "#a3a3a3" }}>
          Pick a section from the sidebar to dive in.
        </p>
      </div>
    </div>
  );
}
