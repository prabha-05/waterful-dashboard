import { NextRequest, NextResponse } from "next/server";
import { computeSalesMetrics } from "@/lib/sales-aggregations";
import { startOfIstDay, addDays } from "@/lib/timezone";

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return NextResponse.json({ error: "date param required" }, { status: 400 });
  }

  // IST-aligned day boundaries so the count matches Shopify's view.
  const targetDate = startOfIstDay(new Date(dateParam));
  const nextDate = addDays(targetDate, 1);

  const metrics = await computeSalesMetrics(targetDate, nextDate);
  return NextResponse.json({ date: dateParam, ...metrics });
}
