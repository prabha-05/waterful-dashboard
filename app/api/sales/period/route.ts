import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeSalesMetrics, computeDailyBreakdown, computeItemDaily } from "@/lib/sales-aggregations";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to params required" }, { status: 400 });
  }

  const start = new Date(from);
  const end = new Date(to);
  end.setDate(end.getDate() + 1);

  const metrics = await computeSalesMetrics(start, end);

  // Daily trend within the period
  const primary = await prisma.salesOrder.findMany({
    where: { date: { gte: start, lt: end }, duplicate: 1 },
    select: { date: true, total: true },
  });

  const dailyMap = new Map<string, { revenue: number; orders: number }>();
  for (const o of primary) {
    const key = `${o.date.getFullYear()}-${String(o.date.getMonth() + 1).padStart(2, "0")}-${String(o.date.getDate()).padStart(2, "0")}`;
    const entry = dailyMap.get(key) || { revenue: 0, orders: 0 };
    entry.revenue += o.total;
    entry.orders++;
    dailyMap.set(key, entry);
  }
  const dailyTrend = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, revenue: Math.round(d.revenue), orders: d.orders }));

  const dailyBreakdown = await computeDailyBreakdown(start, end);
  const { productDaily, paymentDaily } = await computeItemDaily(start, end);

  return NextResponse.json({ from, to, ...metrics, dailyTrend, dailyBreakdown, productDaily, paymentDaily });
}
