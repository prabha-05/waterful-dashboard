import { NextRequest, NextResponse } from "next/server";
import { computeSalesMetrics } from "@/lib/sales-aggregations";

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return NextResponse.json({ error: "date param required" }, { status: 400 });
  }

  const targetDate = new Date(dateParam);
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const metrics = await computeSalesMetrics(targetDate, nextDate);
  return NextResponse.json({ date: dateParam, ...metrics });
}
