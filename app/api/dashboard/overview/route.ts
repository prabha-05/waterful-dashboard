import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  startOfIstDay,
  startOfIstMonth,
  addDays,
  addIstMonths,
  istDayOfWeek,
  formatIstYmd,
  formatIstShort,
  formatIstMonthYear,
} from "@/lib/timezone";

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

// All date math is IST-aligned. Day boundaries match Shopify's IST view
// regardless of the server's TZ (Vercel reserves the `TZ` env var name so
// we can't set it that way; doing it explicitly in code is more robust).
function buildBuckets(count: number, unit: string, endDay: Date): { label: string; from: Date; to: Date }[] {
  const buckets: { label: string; from: Date; to: Date }[] = [];
  const today = startOfIstDay(endDay);

  for (let i = count - 1; i >= 0; i--) {
    let from: Date, to: Date, label: string;

    if (unit === "day") {
      from = addDays(today, -i);
      to = addDays(from, 1);
      label = formatIstShort(from);
    } else if (unit === "week") {
      // Monday-aligned weeks (Mon–Sun) in IST.
      const dayOfWeek = istDayOfWeek(today); // Sun=0, Mon=1, ..., Sat=6
      const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
      const mondayOfCurrentWeek = addDays(today, -daysSinceMonday);
      from = addDays(mondayOfCurrentWeek, -i * 7);
      to = addDays(from, 7);
      const lastDayOfWeek = addDays(to, -1);
      label = `${formatIstShort(from)} – ${formatIstShort(lastDayOfWeek)}`;
    } else {
      // month
      const monthStart = startOfIstMonth(today);
      from = addIstMonths(monthStart, -i);
      to = addIstMonths(from, 1);
      label = formatIstMonthYear(from);
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

  // Fetch all orders in current + previous range in one query.
  // We include orderId so we can count DISTINCT orders (not line items) —
  // a single Shopify order with N flavours produces N SalesOrder rows.
  const orders = await prisma.salesOrder.findMany({
    where: { duplicate: 1, mobile: { not: "" }, date: { gte: prevFrom, lt: globalTo } },
    select: { mobile: true, total: true, date: true, status: true, orderId: true },
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
    // Track DISTINCT orderIds — a single order can have multiple SalesOrder rows
    // (one per flavour). Counting rows would overstate everything by the average
    // line items per order (~1.5x for this store).
    const allOrderIds = new Set<number>();
    const ftOrderIds = new Set<number>();
    const repeatOrderIds = new Set<number>();
    const cancelledOrderIds = new Set<number>();
    const rtoOrderIds = new Set<number>();
    const ftCancelledOrderIds = new Set<number>();
    const repeatCancelledOrderIds = new Set<number>();
    const ftRtoOrderIds = new Set<number>();
    const repeatRtoOrderIds = new Set<number>();
    let revenue = 0;
    let ftRevenue = 0;
    let repeatRevenue = 0;

    for (const o of bucketOrders) {
      mobiles.add(o.mobile);
      allOrderIds.add(o.orderId);
      revenue += o.total;

      const status = (o.status || "").toLowerCase();
      const isCancelled = status.includes("cancel");
      const isRto = status.includes("rto") || status.includes("return");
      if (isCancelled) cancelledOrderIds.add(o.orderId);
      if (isRto) rtoOrderIds.add(o.orderId);

      const firstDate = firstOrderDate.get(o.mobile);
      const isFt = firstDate && firstDate >= bucket.from && firstDate < bucket.to;
      if (isFt) {
        ftMobiles.add(o.mobile);
        ftOrderIds.add(o.orderId);
        ftRevenue += o.total;
        if (isCancelled) ftCancelledOrderIds.add(o.orderId);
        if (isRto) ftRtoOrderIds.add(o.orderId);
      } else {
        repeatMobiles.add(o.mobile);
        repeatOrderIds.add(o.orderId);
        repeatRevenue += o.total;
        if (isCancelled) repeatCancelledOrderIds.add(o.orderId);
        if (isRto) repeatRtoOrderIds.add(o.orderId);
      }
    }

    const orderCount = allOrderIds.size;
    const ftOrders = ftOrderIds.size;
    const repeatOrders = repeatOrderIds.size;
    const cancelled = cancelledOrderIds.size;
    const rto = rtoOrderIds.size;
    const ftCancelled = ftCancelledOrderIds.size;
    const repeatCancelled = repeatCancelledOrderIds.size;
    const ftRto = ftRtoOrderIds.size;
    const repeatRto = repeatRtoOrderIds.size;
    const customerCount = mobiles.size;

    return {
      label: bucket.label,
      from: formatIstYmd(bucket.from),
      to: formatIstYmd(bucket.to),
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

  // Previous-window totals for delta comparison.
  // Same DISTINCT-orderId rule as the per-bucket logic above.
  const prevOrdersRows = orders.filter(
    (o) => o.date && o.date >= prevFrom && o.date < prevTo
  );
  const prevOrderIds = new Set<number>();
  const prevFtOrderIds = new Set<number>();
  const prevRepeatOrderIds = new Set<number>();
  const prevCancelledIds = new Set<number>();
  const prevRtoIds = new Set<number>();
  const prevFtCancelledIds = new Set<number>();
  const prevRepeatCancelledIds = new Set<number>();
  const prevFtRtoIds = new Set<number>();
  const prevRepeatRtoIds = new Set<number>();
  let prevRevenue = 0;
  let prevFtRevenue = 0;
  let prevRepeatRevenue = 0;
  for (const o of prevOrdersRows) {
    prevOrderIds.add(o.orderId);
    prevRevenue += o.total;
    const s = (o.status || "").toLowerCase();
    const isCancelled = s.includes("cancel");
    const isRto = s.includes("rto") || s.includes("return");
    if (isCancelled) prevCancelledIds.add(o.orderId);
    if (isRto) prevRtoIds.add(o.orderId);
    const firstDate = firstOrderDate.get(o.mobile);
    const isFt = firstDate && firstDate >= prevFrom && firstDate < prevTo;
    if (isFt) {
      prevFtOrderIds.add(o.orderId);
      prevFtRevenue += o.total;
      if (isCancelled) prevFtCancelledIds.add(o.orderId);
      if (isRto) prevFtRtoIds.add(o.orderId);
    } else {
      prevRepeatOrderIds.add(o.orderId);
      prevRepeatRevenue += o.total;
      if (isCancelled) prevRepeatCancelledIds.add(o.orderId);
      if (isRto) prevRepeatRtoIds.add(o.orderId);
    }
  }
  prevRevenue = Math.round(prevRevenue);
  const prevOrdersCount = prevOrderIds.size;
  const prevCustomers = new Set(prevOrdersRows.map((o) => o.mobile)).size;
  const prevAov = prevOrdersCount > 0 ? Math.round(prevRevenue / prevOrdersCount) : 0;
  const prevFtOrders = prevFtOrderIds.size;
  const prevRepeatOrders = prevRepeatOrderIds.size;
  const prevCancelled = prevCancelledIds.size;
  const prevRto = prevRtoIds.size;
  const prevFtCancelled = prevFtCancelledIds.size;
  const prevRepeatCancelled = prevRepeatCancelledIds.size;
  const prevFtRto = prevFtRtoIds.size;
  const prevRepeatRto = prevRepeatRtoIds.size;
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
      from: formatIstYmd(prevFrom),
      to: formatIstYmd(prevTo),
    },
  });
}
