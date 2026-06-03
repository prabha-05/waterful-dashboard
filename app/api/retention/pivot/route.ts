import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Retention pivot: given a date window + a pivot date, returns every customer
// who placed an order inside the window with their lifetime first/last order
// dates plus a Pre/Post tag (relative to the pivot) for each.
//
// Identity matches the rest of the codebase: prefer Shopify's customer.id,
// fall back to mobile number for guest checkouts / old rows.

type CustomerRow = {
  identity: string;
  name: string;
  phone: string;
  email: string | null;
  ordersInRange: number;
  firstOrderDate: string; // ISO YYYY-MM-DD
  lastOrderDate: string;
  firstTag: "pre" | "post";
  lastTag: "pre" | "post";
  // Lifetime orders on/after the pivot date. >= 2 = repeated after pivot.
  postPivotOrders: number;
};

export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  const pivot = req.nextUrl.searchParams.get("pivot");
  if (!start || !end || !pivot) {
    return NextResponse.json({ error: "start, end and pivot params required" }, { status: 400 });
  }

  const startDate = new Date(start);
  const endDateInclusive = new Date(end);
  const endDate = new Date(endDateInclusive);
  endDate.setDate(endDate.getDate() + 1); // half-open
  const pivotDate = new Date(pivot);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || Number.isNaN(pivotDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (endDate <= startDate) {
    return NextResponse.json({ error: "end must be on or after start" }, { status: 400 });
  }

  // Step 1: pull all confirmed orders in the window.
  const inWindow = await prisma.salesOrder.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      duplicate: 1,
      NOT: { status: { contains: "cancel", mode: "insensitive" } },
    },
    select: {
      orderId: true,
      date: true,
      customerName: true,
      mobile: true,
      shopifyCustomerId: true,
    },
  });

  // Step 2: unique customer identities seen in the window.
  const identityOf = (o: { shopifyCustomerId: bigint | null; mobile: string }) =>
    o.shopifyCustomerId ? `cid:${o.shopifyCustomerId}` : `mob:${o.mobile}`;

  type Acc = {
    identity: string;
    name: string;
    phone: string;
    cid: bigint | null;
    mobile: string;
    ordersInRange: number;
    sampleOrderId: number; // any order in the range, used to look up email later
  };
  const byIdentity = new Map<string, Acc>();
  for (const o of inWindow) {
    const id = identityOf(o);
    const existing = byIdentity.get(id);
    if (existing) {
      existing.ordersInRange += 1;
    } else {
      byIdentity.set(id, {
        identity: id,
        name: o.customerName,
        phone: o.mobile,
        cid: o.shopifyCustomerId,
        mobile: o.mobile,
        ordersInRange: 1,
        sampleOrderId: o.orderId,
      });
    }
  }

  if (byIdentity.size === 0) {
    return NextResponse.json({ start, end, pivot, customers: [] });
  }

  // Step 3: lifetime first + last order date for each identity.
  const cids = Array.from(byIdentity.values())
    .map((a) => a.cid)
    .filter((c): c is bigint => c != null);
  const mobiles = Array.from(byIdentity.values())
    .filter((a) => a.cid == null)
    .map((a) => a.mobile);

  const [cidGroups, mobileGroups, cidPostCounts, mobilePostCounts] = await Promise.all([
    cids.length
      ? prisma.salesOrder.groupBy({
          by: ["shopifyCustomerId"],
          where: { shopifyCustomerId: { in: cids } },
          _min: { date: true },
          _max: { date: true },
        })
      : Promise.resolve([]),
    mobiles.length
      ? prisma.salesOrder.groupBy({
          by: ["mobile"],
          where: { mobile: { in: mobiles }, shopifyCustomerId: null },
          _min: { date: true },
          _max: { date: true },
        })
      : Promise.resolve([]),
    // Lifetime count of post-pivot orders per customer — used to flag repeats
    // after the pivot.
    cids.length
      ? prisma.salesOrder.groupBy({
          by: ["shopifyCustomerId"],
          where: {
            shopifyCustomerId: { in: cids },
            date: { gte: pivotDate },
            duplicate: 1,
            NOT: { status: { contains: "cancel", mode: "insensitive" } },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    mobiles.length
      ? prisma.salesOrder.groupBy({
          by: ["mobile"],
          where: {
            mobile: { in: mobiles },
            shopifyCustomerId: null,
            date: { gte: pivotDate },
            duplicate: 1,
            NOT: { status: { contains: "cancel", mode: "insensitive" } },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const lifetime = new Map<string, { first: Date; last: Date }>();
  for (const r of cidGroups) {
    if (r.shopifyCustomerId && r._min.date && r._max.date) {
      lifetime.set(`cid:${r.shopifyCustomerId}`, { first: r._min.date, last: r._max.date });
    }
  }
  for (const r of mobileGroups) {
    if (r.mobile && r._min.date && r._max.date) {
      lifetime.set(`mob:${r.mobile}`, { first: r._min.date, last: r._max.date });
    }
  }

  const postCounts = new Map<string, number>();
  for (const r of cidPostCounts) {
    if (r.shopifyCustomerId) postCounts.set(`cid:${r.shopifyCustomerId}`, r._count._all);
  }
  for (const r of mobilePostCounts) {
    if (r.mobile) postCounts.set(`mob:${r.mobile}`, r._count._all);
  }

  // Step 4: email lookup via ShopifyOrder using the sample orderId (= ShopifyOrder.orderNumber).
  const orderIds = Array.from(byIdentity.values()).map((a) => a.sampleOrderId);
  const shopifyRows = orderIds.length
    ? await prisma.shopifyOrder.findMany({
        where: { orderNumber: { in: orderIds } },
        select: { orderNumber: true, email: true, customerName: true, phone: true },
      })
    : [];
  const shopifyByOrder = new Map(shopifyRows.map((r) => [r.orderNumber, r]));

  const isoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Step 5: assemble + tag.
  const customers: CustomerRow[] = Array.from(byIdentity.values()).map((a) => {
    const life = lifetime.get(a.identity);
    const first = life?.first ?? new Date(0);
    const last = life?.last ?? new Date(0);
    const shop = shopifyByOrder.get(a.sampleOrderId);
    return {
      identity: a.identity,
      name: shop?.customerName || a.name,
      phone: shop?.phone || a.phone,
      email: shop?.email ?? null,
      ordersInRange: a.ordersInRange,
      firstOrderDate: isoDate(first),
      lastOrderDate: isoDate(last),
      firstTag: first < pivotDate ? "pre" : "post",
      lastTag: last < pivotDate ? "pre" : "post",
      postPivotOrders: postCounts.get(a.identity) ?? 0,
    };
  });

  // Sort by most orders in the range, then by name.
  customers.sort((a, b) => b.ordersInRange - a.ordersInRange || a.name.localeCompare(b.name));

  return NextResponse.json({ start, end, pivot, customers });
}
