import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type PeriodBucket = {
  label: string;
  from: string;
  to: string;
  orders: number;
  revenue: number;
  customers: number;
  aov: number;
  ftCustomers: number;
  repeatCustomers: number;
  ftOrders: number;
  repeatOrders: number;
  ftRevenue: number;
  repeatRevenue: number;
  cancelledOrders: number;
  rtoOrders: number;
};

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function buildBuckets(count: number, unit: string, endDay: Date): { label: string; from: Date; to: Date }[] {
  const buckets: { label: string; from: Date; to: Date }[] = [];
  const today = startOfDay(endDay);

  for (let i = count - 1; i >= 0; i--) {
    let from: Date, to: Date, label: string;

    if (unit === "day") {
      from = new Date(today);
      from.setDate(from.getDate() - i);
      to = new Date(from);
      to.setDate(to.getDate() + 1);
      label = from.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    } else if (unit === "week") {
      // Weeks ending today, going backwards
      to = new Date(today);
      to.setDate(to.getDate() - i * 7 + 1);
      from = new Date(to);
      from.setDate(from.getDate() - 7);
      to = new Date(from);
      to.setDate(to.getDate() + 7);
      label = `${from.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(to.getTime() - 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
    } else {
      // month
      from = new Date(today.getFullYear(), today.getMonth() - i, 1);
      to = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
      label = from.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    }

    buckets.push({ label, from, to });
  }

  return buckets;
}

export async function GET(req: NextRequest) {
  const count = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("count") || "7"), 1), 52);
  const unit = req.nextUrl.searchParams.get("unit") || "day";

  if (!["day", "week", "month"].includes(unit)) {
    return NextResponse.json({ error: "unit must be day, week, or month" }, { status: 400 });
  }

  const endParam = req.nextUrl.searchParams.get("end");
  const endDay = endParam ? new Date(endParam) : new Date();

  const buckets = buildBuckets(count, unit, endDay);
  const globalFrom = buckets[0].from;
  const globalTo = buckets[buckets.length - 1].to;

  // Previous equivalent window: same length, ending right before globalFrom
  const windowMs = globalTo.getTime() - globalFrom.getTime();
  const prevTo = new Date(globalFrom.getTime());
  const prevFrom = new Date(globalFrom.getTime() - windowMs);

  // Fetch all orders in current + previous range in one query
  const orders = await prisma.salesOrder.findMany({
    where: { duplicate: 1, mobile: { not: "" }, date: { gte: prevFrom, lt: globalTo } },
    select: { mobile: true, total: true, date: true, status: true },
  });

  // Get first order dates for all mobiles in range
  const mobilesInRange = [...new Set(orders.map((o) => o.mobile))];

  let firstOrderDate = new Map<string, Date>();
  if (mobilesInRange.length > 0) {
    const earliestRows = await prisma.salesOrder.groupBy({
      by: ["mobile"],
      where: { mobile: { in: mobilesInRange }, duplicate: 1 },
      _min: { date: true },
    });
    for (const row of earliestRows) {
      if (row.mobile && row._min.date) firstOrderDate.set(row.mobile, row._min.date);
    }
  }

  // Build period results
  const periods: PeriodBucket[] = buckets.map((bucket) => {
    const bucketOrders = orders.filter(
      (o) => o.date && o.date >= bucket.from && o.date < bucket.to
    );

    const mobiles = new Set<string>();
    const ftMobiles = new Set<string>();
    const repeatMobiles = new Set<string>();
    let revenue = 0;
    let ftRevenue = 0;
    let repeatRevenue = 0;
    let ftOrders = 0;
    let repeatOrders = 0;
    let cancelled = 0;
    let rto = 0;

    for (const o of bucketOrders) {
      mobiles.add(o.mobile);
      revenue += o.total;

      const status = (o.status || "").toLowerCase();
      if (status.includes("cancel")) cancelled++;
      if (status.includes("rto") || status.includes("return")) rto++;

      const firstDate = firstOrderDate.get(o.mobile);
      const isFt = firstDate && firstDate >= bucket.from && firstDate < bucket.to;
      if (isFt) {
        ftMobiles.add(o.mobile);
        ftOrders++;
        ftRevenue += o.total;
      } else {
        repeatMobiles.add(o.mobile);
        repeatOrders++;
        repeatRevenue += o.total;
      }
    }

    const orderCount = bucketOrders.length;
    const customerCount = mobiles.size;

    return {
      label: bucket.label,
      from: formatDate(bucket.from),
      to: formatDate(bucket.to),
      orders: orderCount,
      revenue: Math.round(revenue),
      customers: customerCount,
      aov: orderCount > 0 ? Math.round(revenue / orderCount) : 0,
      ftCustomers: ftMobiles.size,
      repeatCustomers: repeatMobiles.size,
      ftOrders,
      repeatOrders,
      ftRevenue: Math.round(ftRevenue),
      repeatRevenue: Math.round(repeatRevenue),
      cancelledOrders: cancelled,
      rtoOrders: rto,
    };
  });

  // Totals (current window)
  const totalOrders = periods.reduce((s, p) => s + p.orders, 0);
  const totalRevenue = periods.reduce((s, p) => s + p.revenue, 0);
  const totalCustomers = new Set(
    orders.filter((o) => o.date && o.date >= globalFrom && o.date < globalTo).map((o) => o.mobile)
  ).size;

  // Previous-window totals for delta comparison
  const prevOrdersRows = orders.filter(
    (o) => o.date && o.date >= prevFrom && o.date < prevTo
  );
  const prevOrdersCount = prevOrdersRows.length;
  const prevRevenue = Math.round(prevOrdersRows.reduce((s, o) => s + o.total, 0));
  const prevCustomers = new Set(prevOrdersRows.map((o) => o.mobile)).size;
  const prevAov = prevOrdersCount > 0 ? Math.round(prevRevenue / prevOrdersCount) : 0;
  const prevCancelled = prevOrdersRows.filter((o) =>
    (o.status || "").toLowerCase().includes("cancel")
  ).length;
  const prevRto = prevOrdersRows.filter((o) => {
    const s = (o.status || "").toLowerCase();
    return s.includes("rto") || s.includes("return");
  }).length;

  return NextResponse.json({
    count,
    unit,
    periods,
    totals: {
      orders: totalOrders,
      revenue: totalRevenue,
      customers: totalCustomers,
      aov: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    },
    previousTotals: {
      orders: prevOrdersCount,
      revenue: prevRevenue,
      customers: prevCustomers,
      aov: prevAov,
      cancelledOrders: prevCancelled,
      rtoOrders: prevRto,
    },
    previousWindow: {
      from: formatDate(prevFrom),
      to: formatDate(prevTo),
    },
  });
}
