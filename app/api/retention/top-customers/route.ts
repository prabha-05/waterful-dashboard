import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 1), 100);

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
    select: { mobile: true, customerName: true, total: true },
  });

  type Agg = { name: string; mobile: string; orders: number; revenue: number };
  const map = new Map<string, Agg>();
  for (const o of orders) {
    const key = o.mobile;
    const existing = map.get(key);
    if (existing) {
      existing.orders += 1;
      existing.revenue += o.total;
      if (!existing.name && o.customerName) existing.name = o.customerName;
    } else {
      map.set(key, {
        name: o.customerName || "Unknown",
        mobile: key,
        orders: 1,
        revenue: o.total,
      });
    }
  }

  const rows = Array.from(map.values())
    .map((r) => ({
      name: r.name,
      mobile: r.mobile,
      orders: r.orders,
      revenue: Math.round(r.revenue),
      aov: Math.round(r.revenue / r.orders),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

  return NextResponse.json({ from, to, rows });
}
