import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { computeSalesMetrics } from "@/lib/sales-aggregations";
import { DetailView, DetailKind } from "@/components/ui/detail-view";

const KIND_META: Record<
  DetailKind,
  { title: string; sub: string; color: string }
> = {
  sales: {
    title: "Total Sales",
    sub: "Revenue broken down by product and state",
    color: "from-emerald-600 to-teal-600",
  },
  customers: {
    title: "Customers",
    sub: "Names, phone numbers, and lifetime spend",
    color: "from-violet-600 to-fuchsia-600",
  },
  orders: {
    title: "All Orders",
    sub: "Every order row with customer phone and status",
    color: "from-sky-600 to-indigo-600",
  },
  rto: {
    title: "RTO Orders",
    sub: "Returned-to-origin shipments and hotspots",
    color: "from-amber-600 to-orange-600",
  },
  cancelled: {
    title: "Cancelled Orders",
    sub: "Orders cancelled before fulfilment",
    color: "from-rose-600 to-pink-600",
  },
};

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export default async function SalesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { kind: rawKind } = await params;
  const sp = await searchParams;

  const kind = rawKind as DetailKind;
  if (!(kind in KIND_META)) notFound();

  const dateStr = typeof sp.date === "string" ? sp.date : undefined;
  const fromStr = typeof sp.from === "string" ? sp.from : undefined;
  const toStr = typeof sp.to === "string" ? sp.to : undefined;

  let startDate: Date | null = null;
  let endDate: Date | null = null;
  let backHref = "/dashboard/sales/summary";
  let rangeLabel = "";

  if (dateStr) {
    const d = parseDate(dateStr);
    if (d) {
      startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      endDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      backHref = `/dashboard/sales/summary?mode=day&date=${dateStr}`;
      rangeLabel = d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  } else if (fromStr && toStr) {
    const f = parseDate(fromStr);
    const t = parseDate(toStr);
    if (f && t) {
      startDate = new Date(f.getFullYear(), f.getMonth(), f.getDate());
      endDate = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
      backHref = `/dashboard/sales/summary?mode=range&from=${fromStr}&to=${toStr}`;
      rangeLabel = `${f.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} — ${t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
    }
  }

  if (!startDate || !endDate) {
    return (
      <div className="p-8">
        <Link
          href="/dashboard/sales/specific-day"
          className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft size={16} /> Back
        </Link>
        <p className="mt-6 rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500">
          Missing date range. Open this page from a KPI card.
        </p>
      </div>
    );
  }

  const metrics = await computeSalesMetrics(startDate, endDate);
  const meta = KIND_META[kind];

  return (
    <div className="relative min-h-full">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 0% 0%, rgba(16,185,129,0.06), transparent 40%), radial-gradient(circle at 100% 0%, rgba(139,92,246,0.06), transparent 40%)",
        }}
      />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900"
            >
              <ArrowLeft size={14} /> Back
            </Link>
            <h1
              className={`mt-2 bg-gradient-to-r ${meta.color} bg-clip-text text-3xl font-bold text-transparent`}
            >
              {meta.title}
            </h1>
            <p className="text-neutral-500">{meta.sub}</p>
          </div>
          {rangeLabel && (
            <span className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm">
              {rangeLabel}
            </span>
          )}
        </div>

        <DetailView kind={kind} metrics={metrics} />
      </div>
    </div>
  );
}
