import { NextRequest, NextResponse } from "next/server";
import { computeSalesMetrics } from "@/lib/sales-aggregations";
import { startOfIstDay, addDays } from "@/lib/timezone";

// Aggregated sales metrics across an inclusive date range. Mirrors /daily
// but expects from + to instead of a single date.
export async function GET(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  if (!fromParam || !toParam) {
    return NextResponse.json({ error: "from and to params required" }, { status: 400 });
  }

  // IST-aligned boundaries; "to" is inclusive (so we add 1 day to make the
  // range half-open for the query).
  const start = startOfIstDay(new Date(fromParam));
  const endInclusive = startOfIstDay(new Date(toParam));
  const end = addDays(endInclusive, 1);

  if (end <= start) {
    return NextResponse.json({ error: "to must be on or after from" }, { status: 400 });
  }

  const metrics = await computeSalesMetrics(start, end);
  return NextResponse.json({ from: fromParam, to: toParam, ...metrics });
}
