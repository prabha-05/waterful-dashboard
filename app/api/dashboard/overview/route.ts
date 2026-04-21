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
  ftCancelledOrders: number;
  repeatCancelledOrders: number;
  ftRtoOrders: number;
  repeatRtoOrders: number;
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
      // Weeks aligned to Sunday (Sun–Sat). The most recent week is the one
      // containing `today`; earlier weeks step back 7 days at a time.
      const dayOfWeek = today.getDay(); // Sunday = 0
      const sundayOfCurrentWeek = new Date(today);
      sundayOfCurrentWeek.setDate(today.getDate() - dayOfWeek);
      from = new Date(sundayOfCurrentWeek);
      from.setDate(sundayOfCurrentWeek.getDate() - i * 7);
      to = new Date(from);
      to.setDate(from.getDate() + 7);
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
    let ftCancelled = 0;
    let repeatCancelled = 0;
    let ftRto = 0;
    let repeatRto = 0;

    for (const o of bucketOrders) {
      mobiles.add(o.mobile);
      revenue += o.total;

      const status = (o.status || "").toLowerCase();
      const isCancelled = status.includes("cancel");
      const isRto = status.includes("rto") || status.includes("return");
      if (isCancelled) cancelled++;
      if (isRto) rto++;

      const firstDate = firstOrderDate.get(o.mobile);
      const isFt = firstDate && firstDate >= bucket.from && firstDate < bucket.to;
      if (isFt) {
        ftMobiles.add(o.mobile);
        ftOrders++;
        ftRevenue += o.total;
        if (isCancelled) ftCancelled++;
        if (isRto) ftRto++;
      } else {
        repeatMobiles.add(o.mobile);
        repeatOrders++;
        repeatRevenue += o.total;
        if (isCancelled) repeatCancelled++;
        if (isRto) repeatRto++;
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
      ftCancelledOrders: ftCancelled,
      repeatCancelledOrders: repeatCancelled,
      ftRtoOrders: ftRto,
      repeatRtoOrders: repeatRto,
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

  let prevFtRevenue = 0;
  let prevRepeatRevenue = 0;
  let prevFtOrders = 0;
  let prevRepeatOrders = 0;
  let prevCancelled = 0;
  let prevRto = 0;
  let prevFtCancelled = 0;
  let prevRepeatCancelled = 0;
  let prevFtRto = 0;
  let prevRepeatRto = 0;
  for (const o of prevOrdersRows) {
    const s = (o.status || "").toLowerCase();
    const isCancelled = s.includes("cancel");
    const isRto = s.includes("rto") || s.includes("return");
    if (isCancelled) prevCancelled++;
    if (isRto) prevRto++;
    const firstDate = firstOrderDate.get(o.mobile);
    const isFt = firstDate && firstDate >= prevFrom && firstDate < prevTo;
    if (isFt) {
      prevFtOrders++;
      prevFtRevenue += o.total;
      if (isCancelled) prevFtCancelled++;
      if (isRto) prevFtRto++;
    } else {
      prevRepeatOrders++;
      prevRepeatRevenue += o.total;
      if (isCancelled) prevRepeatCancelled++;
      if (isRto) prevRepeatRto++;
    }
  }
  const prevFtAov = prevFtOrders > 0 ? Math.round(prevFtRevenue / prevFtOrders) : 0;
  const prevRepeatAov = prevRepeatOrders > 0 ? Math.round(prevRepeatRevenue / prevRepeatOrders) : 0;

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
      ftAov: prevFtAov,
      repeatAov: prevRepeatAov,
      cancelledOrders: prevCancelled,
      rtoOrders: prevRto,
      ftCancelledOrders: prevFtCancelled,
      repeatCancelledOrders: prevRepeatCancelled,
      ftRtoOrders: prevFtRto,
      repeatRtoOrders: prevRepeatRto,
    },
    previousWindow: {
      from: formatDate(prevFrom),
      to: formatDate(prevTo),
    },
  });
}
