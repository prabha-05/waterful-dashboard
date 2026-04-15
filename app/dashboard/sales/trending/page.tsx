import { SalesTrending } from "@/components/ui/sales-trending";

export default function SalesTrendingPage() {
  return (
    <div className="relative min-h-full">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 0% 0%, rgba(236,72,153,0.06), transparent 40%), radial-gradient(circle at 100% 0%, rgba(79,70,229,0.06), transparent 40%), radial-gradient(circle at 50% 100%, rgba(245,158,11,0.05), transparent 50%)",
        }}
      />
      <div className="space-y-2 p-8">
        <h1 className="bg-gradient-to-r from-rose-700 via-indigo-800 to-slate-900 bg-clip-text text-3xl font-bold text-transparent">
          Sales Trending
        </h1>
        <p className="mb-6 text-neutral-500">
          Pick a date range to see how revenue, orders, and customers move over time.
        </p>
        <SalesTrending />
      </div>
    </div>
  );
}
