export default function DashboardHomePage() {
  return (
    <div className="relative min-h-full" style={{ background: "#fdfaf4" }}>
      <div className="space-y-3 p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold" style={{ color: "#4a3a2e" }}>
          Dashboard
        </h1>
        <p className="text-sm italic" style={{ color: "#9a8571" }}>
          Pick a section from the sidebar to dive in.
        </p>
      </div>
    </div>
  );
}
