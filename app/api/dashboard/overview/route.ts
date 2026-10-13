import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
// Build N consecutive buckets going FORWARD from startDay.
// Day → N days starting on startDay. Week → N Monday-aligned weeks
// starting from the Monday of startDay's week. Month → N calendar months
// starting on the 1st of startDay's month.
function buildBuckets(count: number, unit: string, startDay: Date): { label: string; from: Date; to: Date }[] {
  const buckets: { label: string; from: Date; to: Date }[] = [];
  const start = startOfIstDay(startDay);

  for (let i = 0; i < count; i++) {
    let from: Date, to: Date, label: string;

    if (unit === "day") {
      from = addDays(start, i);
      to = addDays(from, 1);
      label = formatIstShort(from);
    } else if (unit === "week") {
      const dayOfWeek = istDayOfWeek(start);
      const daysSinceMonday = (dayOfWeek + 6) % 7;
      const mondayOfStartWeek = addDays(start, -daysSinceMonday);
      from = addDays(mondayOfStartWeek, i * 7);
      to = addDays(from, 7);
      const lastDayOfWeek = addDays(to, -1);
      label = `${formatIstShort(from)} – ${formatIstShort(lastDayOfWeek)}`;
    } else {
      const monthStart = startOfIstMonth(start);
      from = addIstMonths(monthStart, i);
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

  const startParam = req.nextUrl.searchParams.get("start");
  // Back-compat: also accept old `end` param so a stale client doesn't 500.
  const endParam = req.nextUrl.searchParams.get("end");
  let startDay: Date;
  if (startParam) {
    startDay = new Date(startParam);
  } else if (endParam) {
    // Old end-anchored: convert to start-anchored equivalent.
    startDay = addDays(new Date(endParam), -(count - 1));
  } else {
    // Default: window starting (count - 1) days/weeks/months back.
    const today = new Date();
    startDay = addDays(today, -(count - 1));
  }

  const buckets = buildBuckets(count, unit, startDay);
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
    select: { mobile: true, total: true, date: true, status: true, orderId: true, shopifyCustomerId: true },
  });

  // Identifying a repeat buyer by the raw mobile string is not safe: the same
  // person appears as "9375017035" on one order and "+919375017035" on another
  // (both formats are in the table, and 1,176 customers carry more than one),
  // which made their second order look like a first-ever order and understated
  // every repeat figure on this page. Shopify's customer.id is stable but is
  // null on ~37k older imported rows, so neither key alone is enough.
  //
  // So: look the customer up under BOTH keys — customer.id, and the mobile
  // normalised to its last 10 digits — and treat the EARLIER of the two as
  // their first order. An order is first-time only if neither key has seen
  // them before this bucket.
  const normalizeMobile = (m: string) => m.replace(/\D/g, "").slice(-10);
  const mobilesInRange = [...new Set(orders.map((o) => normalizeMobile(o.mobile)).filter(Boolean))];
  const cidsInRange = [...new Set(orders.map((o) => o.shopifyCustomerId).filter((c): c is bigint => c !== null))];

  const firstByMobile = new Map<string, Date>();
  const firstByCid = new Map<string, Date>();
  if (mobilesInRange.length > 0) {
    const rows = await prisma.$queryRaw<{ key: string; first: Date }[]>`
      SELECT RIGHT(REGEXP_REPLACE(mobile, '\\D', '', 'g'), 10) AS key, MIN(date) AS first
      FROM "SalesOrder"
      WHERE duplicate = 1
        AND RIGHT(REGEXP_REPLACE(mobile, '\\D', '', 'g'), 10) IN (${Prisma.join(mobilesInRange)})
      GROUP BY 1`;
    for (const r of rows) if (r.key && r.first) firstByMobile.set(r.key, r.first);
  }
  if (cidsInRange.length > 0) {
    const rows = await prisma.salesOrder.groupBy({
      by: ["shopifyCustomerId"],
      where: { shopifyCustomerId: { in: cidsInRange }, duplicate: 1 },
      _min: { date: true },
    });
    for (const r of rows) {
      if (r.shopifyCustomerId && r._min.date) firstByCid.set(String(r.shopifyCustomerId), r._min.date);
    }
  }
  const firstOrderOf = (o: { mobile: string; shopifyCustomerId: bigint | null }): Date | undefined => {
    const byMobile = firstByMobile.get(normalizeMobile(o.mobile));
    const byCid = o.shopifyCustomerId ? firstByCid.get(String(o.shopifyCustomerId)) : undefined;
    if (byMobile && byCid) return byMobile < byCid ? byMobile : byCid;
    return byMobile ?? byCid;
  };

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

      const status = (o.status || "").toLowerCase();
      const isCancelled = status.includes("cancel");
      const isRto = status.includes("rto") || status.includes("return");
      if (isCancelled) cancelledOrderIds.add(o.orderId);
      if (isRto) rtoOrderIds.add(o.orderId);
      // Revenue excludes cancelled to match Shopify's "Total sales" view.
      if (!isCancelled) revenue += o.total;

      const firstDate = firstOrderOf(o);
      const isFt = firstDate && firstDate >= bucket.from && firstDate < bucket.to;
      if (isFt) {
        ftMobiles.add(o.mobile);
        ftOrderIds.add(o.orderId);
        if (!isCancelled) ftRevenue += o.total;
        if (isCancelled) ftCancelledOrderIds.add(o.orderId);
        if (isRto) ftRtoOrderIds.add(o.orderId);
      } else {
        repeatMobiles.add(o.mobile);
        repeatOrderIds.add(o.orderId);
        if (!isCancelled) repeatRevenue += o.total;
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
    const s = (o.status || "").toLowerCase();
    const isCancelled = s.includes("cancel");
    const isRto = s.includes("rto") || s.includes("return");
    if (isCancelled) prevCancelledIds.add(o.orderId);
    if (isRto) prevRtoIds.add(o.orderId);
    if (!isCancelled) prevRevenue += o.total;
    const firstDate = firstOrderOf(o);
    const isFt = firstDate && firstDate >= prevFrom && firstDate < prevTo;
    if (isFt) {
      prevFtOrderIds.add(o.orderId);
      if (!isCancelled) prevFtRevenue += o.total;
      if (isCancelled) prevFtCancelledIds.add(o.orderId);
      if (isRto) prevFtRtoIds.add(o.orderId);
    } else {
      prevRepeatOrderIds.add(o.orderId);
      if (!isCancelled) prevRepeatRevenue += o.total;
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
