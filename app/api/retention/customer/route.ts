import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("phone") || "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) {
    return NextResponse.json({ error: "phone required (min 6 digits)" }, { status: 400 });
  }
  const last10 = digits.slice(-10);

  const orders = await prisma.salesOrder.findMany({
    where: { mobile: { endsWith: last10 }, duplicate: 1 },
    orderBy: { date: "desc" },
  });

  if (orders.length === 0) {
    return NextResponse.json({ found: false, phone: raw });
  }

  const totalOrders = orders.length;
  const totalSpent = orders.reduce((s, o) => s + o.total, 0);
  const aov = totalSpent / totalOrders;
  const firstOrder = orders[orders.length - 1];
  const lastOrder = orders[0];

  const daysSince = Math.floor((Date.now() - lastOrder.date.getTime()) / 86_400_000);
  const daysActive = Math.max(
    1,
    Math.floor((lastOrder.date.getTime() - firstOrder.date.getTime()) / 86_400_000),
  );
  const biggestOrder = orders.reduce((m, o) => (o.total > m.total ? o : m), orders[0]);

  const name =
    orders.find((o) => o.customerName && o.customerName.trim())?.customerName || "Unknown";
  const mobile = orders[0].mobile;

  const addrMap = new Map<string, { city: string; state: string; pincode: string; count: number }>();
  for (const o of orders) {
    const key = `${o.billingCity}|${o.billingState}|${o.pincode}`;
    const existing = addrMap.get(key);
    if (existing) existing.count++;
    else addrMap.set(key, { city: o.billingCity, state: o.billingState, pincode: o.pincode, count: 1 });
  }
  const addresses = Array.from(addrMap.values()).sort((a, b) => b.count - a.count);

  const flavMap = new Map<string, { qty: number; revenue: number; orders: number }>();
  for (const o of orders) {
    const f = o.flavour || "Unknown";
    const agg = flavMap.get(f) || { qty: 0, revenue: 0, orders: 0 };
    agg.qty += o.qty;
    agg.revenue += o.total;
    agg.orders += 1;
    flavMap.set(f, agg);
  }
  const topFlavours = Array.from(flavMap.entries())
    .map(([flavour, v]) => ({ flavour, qty: v.qty, orders: v.orders, revenue: Math.round(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  const payMap = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const p = o.paymentMethod || "Unknown";
    const agg = payMap.get(p) || { orders: 0, revenue: 0 };
    agg.orders += 1;
    agg.revenue += o.total;
    payMap.set(p, agg);
  }
  const paymentMethods = Array.from(payMap.entries())
    .map(([method, v]) => ({ method, orders: v.orders, revenue: Math.round(v.revenue) }))
    .sort((a, b) => b.orders - a.orders);

  const monthMap = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const mk = `${o.date.getFullYear()}-${String(o.date.getMonth() + 1).padStart(2, "0")}`;
    const agg = monthMap.get(mk) || { orders: 0, revenue: 0 };
    agg.orders += 1;
    agg.revenue += o.total;
    monthMap.set(mk, agg);
  }
  const monthly = Array.from(monthMap.entries())
    .map(([month, v]) => ({ month, orders: v.orders, revenue: Math.round(v.revenue) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  let status: "Active" | "Warm" | "At-risk" | "Dormant";
  if (daysSince <= 30) status = "Active";
  else if (daysSince <= 90) status = "Warm";
  else if (daysSince <= 180) status = "At-risk";
  else status = "Dormant";

  let avgGapDays: number | null = null;
  if (orders.length > 1) {
    const sortedAsc = [...orders].sort((a, b) => a.date.getTime() - b.date.getTime());
    let totalGap = 0;
    for (let i = 1; i < sortedAsc.length; i++) {
      totalGap += sortedAsc[i].date.getTime() - sortedAsc[i - 1].date.getTime();
    }
    avgGapDays = Math.round(totalGap / 86_400_000 / (sortedAsc.length - 1));
  }

  return NextResponse.json({
    found: true,
    profile: {
      name,
      mobile,
      status,
      firstOrderDate: firstOrder.date.toISOString(),
      lastOrderDate: lastOrder.date.toISOString(),
      daysSince,
      daysActive,
      totalOrders,
      totalSpent: Math.round(totalSpent),
      aov: Math.round(aov),
      biggestOrder: Math.round(biggestOrder.total),
      avgGapDays,
      isVip: totalOrders >= 5,
    },
    addresses,
    topFlavours,
    paymentMethods,
    monthly,
    orders: orders.map((o) => ({
      id: o.id,
      date: o.date.toISOString(),
      flavour: o.flavour,
      qty: o.qty,
      total: Math.round(o.total),
      status: o.status,
      paymentMethod: o.paymentMethod || "",
      orderId: o.orderId,
    })),
  });
}
