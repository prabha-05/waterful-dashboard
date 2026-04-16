import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return NextResponse.json({ error: "date param required" }, { status: 400 });
  }

  const start = new Date(dateParam);
  const end = new Date(dateParam);
  end.setDate(end.getDate() + 1);

  const orders = await prisma.salesOrder.findMany({
    where: { duplicate: 1, mobile: { not: "" }, date: { gte: start, lt: end } },
    select: { mobile: true, total: true, orderId: true },
  });

  if (orders.length === 0) {
    return NextResponse.json({
      date: dateParam,
      ftOrders: 0, ftCustomers: 0, ftRevenue: 0, ftAov: 0,
      repeatCustomers: 0, repeatOrders: 0, repeatRevenue: 0, repeatAov: 0,
      retentionRate: 0, repeatFrequency: 0,
      totalOrders: 0, totalCustomers: 0, totalRevenue: 0, totalAov: 0,
      dropOff: 0, arpu: 0, arpuExpansion: 0, ltv: 0, ltvExpansion: 0,
    });
  }

  const mobilesInRange = [...new Set(orders.map((o) => o.mobile))];

  const earliestRows = await prisma.salesOrder.groupBy({
    by: ["mobile"],
    where: { mobile: { in: mobilesInRange }, duplicate: 1 },
    _min: { date: true },
  });
  const firstOrderDate = new Map<string, Date>();
  for (const row of earliestRows) {
    if (row.mobile && row._min.date) firstOrderDate.set(row.mobile, row._min.date);
  }

  const orderCountRows = await prisma.salesOrder.groupBy({
    by: ["mobile"],
    where: { mobile: { in: mobilesInRange }, duplicate: 1 },
    _count: { id: true },
  });
  const totalOrdersByMobile = new Map<string, number>();
  for (const row of orderCountRows) {
    totalOrdersByMobile.set(row.mobile, row._count.id);
  }

  const isFirstTime = (mobile: string) => {
    const d = firstOrderDate.get(mobile);
    return !!d && d >= start && d < end;
  };

  let ftOrders = 0, ftRevenue = 0, repeatOrders = 0, repeatRevenue = 0;
  const ftMobiles = new Set<string>();
  const repeatMobiles = new Set<string>();
  const allMobiles = new Set<string>();

  for (const o of orders) {
    allMobiles.add(o.mobile);
    if (isFirstTime(o.mobile)) {
      ftOrders++;
      ftRevenue += o.total;
      ftMobiles.add(o.mobile);
    } else {
      repeatOrders++;
      repeatRevenue += o.total;
      repeatMobiles.add(o.mobile);
    }
  }

  const totalOrders = orders.length;
  const totalCustomers = allMobiles.size;
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const ftCustomers = ftMobiles.size;
  const repeatCustomersCount = repeatMobiles.size;

  let customersWithMultipleOrders = 0;
  let customersWithSingleOrder = 0;
  for (const mobile of allMobiles) {
    const count = totalOrdersByMobile.get(mobile) || 0;
    if (count > 1) customersWithMultipleOrders++;
    else customersWithSingleOrder++;
  }

  const retentionRate = totalCustomers > 0
    ? Math.round(((customersWithMultipleOrders / totalCustomers) * 100) * 10) / 10
    : 0;

  let totalRepeatOrdersAllTime = 0;
  for (const mobile of allMobiles) {
    const count = totalOrdersByMobile.get(mobile) || 0;
    if (count > 1) totalRepeatOrdersAllTime += count - 1;
  }
  const repeatFrequency = customersWithMultipleOrders > 0
    ? Math.round((totalRepeatOrdersAllTime / customersWithMultipleOrders) * 10) / 10
    : 0;

  const ftAov = ftOrders > 0 ? Math.round(ftRevenue / ftOrders) : 0;
  const repeatAov = repeatOrders > 0 ? Math.round(repeatRevenue / repeatOrders) : 0;
  const totalAov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const dropOff = ftCustomers > 0
    ? Math.round(((customersWithSingleOrder / ftCustomers) * 100) * 10) / 10
    : 0;
  const arpu = totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;
  const arpuExpansion = Math.round(totalAov * (retentionRate / 100) * repeatFrequency);
  const ordersPerCustomer = totalCustomers > 0 ? totalOrders / totalCustomers : 0;
  const ltv = Math.round(totalAov * ordersPerCustomer);
  const ltvExpansion = Math.round(totalAov * (1 + (retentionRate / 100) * repeatFrequency));

  return NextResponse.json({
    date: dateParam,
    ftOrders, ftCustomers, ftRevenue: Math.round(ftRevenue), ftAov,
    repeatCustomers: repeatCustomersCount, repeatOrders, repeatRevenue: Math.round(repeatRevenue), repeatAov,
    retentionRate, repeatFrequency,
    totalOrders, totalCustomers, totalRevenue: Math.round(totalRevenue), totalAov,
    dropOff, arpu, arpuExpansion, ltv, ltvExpansion,
  });
}
