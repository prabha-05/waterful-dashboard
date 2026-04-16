import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to params required" }, { status: 400 });
  }

  const start = new Date(from);
  const end = new Date(to);
  end.setDate(end.getDate() + 1);

  const orders = await prisma.salesOrder.findMany({
    where: {
      duplicate: 1,
      mobile: { not: "" },
      date: { gte: start, lt: end },
    },
    select: { mobile: true, total: true },
  });

  const perCustomer = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const c = perCustomer.get(o.mobile) || { orders: 0, revenue: 0 };
    c.orders += 1;
    c.revenue += o.total;
    perCustomer.set(o.mobile, c);
  }

  const totalCustomers = perCustomer.size;
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);

  type Bucket = {
    label: string;
    customers: number;
    orders: number;
    revenue: number;
    pct: number;
    aov: number;
  };

  const bucketKeys = ["1", "2", "3", "4+"] as const;
  const buckets: Record<(typeof bucketKeys)[number], Bucket> = Object.fromEntries(
    bucketKeys.map((k) => [k, { label: k, customers: 0, orders: 0, revenue: 0, pct: 0, aov: 0 }]),
  ) as Record<(typeof bucketKeys)[number], Bucket>;

  for (const { orders: n, revenue } of perCustomer.values()) {
    const key: (typeof bucketKeys)[number] = n >= 4 ? "4+" : (String(n) as (typeof bucketKeys)[number]);
    const b = buckets[key];
    b.customers += 1;
    b.orders += n;
    b.revenue += revenue;
  }

  for (const k of bucketKeys) {
    const b = buckets[k];
    b.pct = totalCustomers > 0 ? (b.customers / totalCustomers) * 100 : 0;
    b.aov = b.orders > 0 ? Math.round(b.revenue / b.orders) : 0;
    b.revenue = Math.round(b.revenue);
  }

  return NextResponse.json({
    from,
    to,
    totalCustomers,
    totalOrders,
    totalRevenue: Math.round(totalRevenue),
    buckets: bucketKeys.map((k) => buckets[k]),
  });
}
