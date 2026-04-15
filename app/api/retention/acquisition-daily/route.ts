import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month=YYYY-MM required" }, { status: 400 });
  }

  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);

  const firstOrders = await prisma.salesOrder.groupBy({
    by: ["mobile"],
    _min: { date: true },
    where: { mobile: { not: "" }, duplicate: 1 },
  });

  const firstDayMobiles = new Map<string, string>();
  for (const r of firstOrders) {
    const d = r._min.date;
    if (!r.mobile || !d) continue;
    if (d < monthStart || d >= monthEnd) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    firstDayMobiles.set(r.mobile, key);
  }

  if (firstDayMobiles.size === 0) {
    return NextResponse.json({ month, days: [] });
  }

  const mobiles = Array.from(firstDayMobiles.keys());
  const firstDayOrders = await prisma.salesOrder.findMany({
    where: { mobile: { in: mobiles }, duplicate: 1, date: { gte: monthStart, lt: monthEnd } },
    select: { mobile: true, date: true, total: true },
  });

  const dayMap = new Map<string, { count: Set<string>; orders: number; revenue: number }>();
  for (const o of firstDayOrders) {
    const firstDay = firstDayMobiles.get(o.mobile);
    if (!firstDay) continue;
    const oDay = `${o.date.getFullYear()}-${String(o.date.getMonth() + 1).padStart(2, "0")}-${String(o.date.getDate()).padStart(2, "0")}`;
    if (oDay !== firstDay) continue;
    const bucket = dayMap.get(firstDay) || { count: new Set<string>(), orders: 0, revenue: 0 };
    bucket.count.add(o.mobile);
    bucket.orders += 1;
    bucket.revenue += o.total;
    dayMap.set(firstDay, bucket);
  }

  const days = Array.from(dayMap.entries())
    .map(([date, b]) => ({
      date,
      customers: b.count.size,
      orders: b.orders,
      revenue: Math.round(b.revenue),
      aov: b.orders > 0 ? Math.round(b.revenue / b.orders) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const total = days.reduce((s, d) => s + d.customers, 0);

  return NextResponse.json({ month, total, days });
}
