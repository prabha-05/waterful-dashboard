import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startOfIstDay, addDays, formatIstYmd } from "@/lib/timezone";

// Retention pivot: given a date window + a pivot date, returns every customer
// who placed an order inside the window with their lifetime first/last order
// dates plus a Pre/Post tag (relative to the pivot) for each.
//
// Identity matches the rest of the codebase: prefer Shopify's customer.id,
// fall back to mobile number for guest checkouts / old rows. Rows with
// neither a cid nor a non-empty mobile are skipped (can't be deduped safely).

type CustomerRow = {
  identity: string;
  name: string;
  phone: string;
  email: string | null;
  // Orders inside [start, end] — what most users actually care about.
  ordersInRange: number;
  // Total active orders across the customer's entire history. Surfaced so
  // it's obvious why first/last dates can fall outside the window.
  lifetimeOrders: number;
  // Total qty of product across the customer's entire history. One order
  // can have multiple units, so this is usually >= lifetimeOrders.
  lifetimeUnits: number;
  // Total INR spent across the customer's entire history (sum of order
  // totals, including tax/shipping as Shopify reports them).
  lifetimeRevenue: number;
  firstOrderDate: string;
  lastOrderDate: string;
  firstTag: "pre" | "post";
  lastTag: "pre" | "post";
  postPivotOrders: number;
  postPivotUnits: number;
  postPivotRevenue: number;
};

// Delivered-order filter — matches clean_up_file.py's is_delivered():
//   • ShopifyOrder.fulfillmentStatus = 'fulfilled'
//   • ShopifyOrder.cancelledAt IS NULL
//   • ShopifyOrder.tags do NOT contain "RTO Delivered" / "RTO Initiated"
//     / "rtorejected" (case-insensitive)
// We pre-fetch the list of delivered ShopifyOrder.orderNumber values
// once per request and then filter every SalesOrder query by
// `orderId IN (delivered list)` + `duplicate = 1`.
async function fetchDeliveredOrderIds(): Promise<number[]> {
  const rows = await prisma.shopifyOrder.findMany({
    where: {
      fulfillmentStatus: "fulfilled",
      cancelledAt: null,
      NOT: {
        OR: [
          { tags: { contains: "RTO Delivered", mode: "insensitive" as const } },
          { tags: { contains: "RTO Initiated", mode: "insensitive" as const } },
          { tags: { contains: "rtorejected", mode: "insensitive" as const } },
        ],
      },
    },
    select: { orderNumber: true },
  });
  return rows.map((r) => r.orderNumber);
}

// Normalize Indian mobile numbers — matches clean_up_file.py's rules:
//   • Strip non-digits
//   • Drop leading 91 (handles 12- or 13-digit "+91..." forms)
//   • Drop leading 0
//   • Require exactly 10 digits AND first digit in {6,7,8,9} (the
//     real Indian mobile range — landlines / garbage have other prefixes)
//   • Reject any value containing "@" (catches email-in-mobile rows)
function normalizeMobile(raw: string | null | undefined): string {
  if (!raw) return "";
  const str = String(raw).trim();
  if (!str || str.includes("@")) return "";
  let s = str.replace(/\D/g, "");
  if ((s.length === 12 || s.length === 13) && s.startsWith("91")) s = s.slice(2);
  if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
  if (s.length === 10 && /[6789]/.test(s[0])) return s;
  return "";
}

export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  const pivot = req.nextUrl.searchParams.get("pivot");
  if (!start || !end || !pivot) {
    return NextResponse.json({ error: "start, end and pivot params required" }, { status: 400 });
  }

  // IST-aligned boundaries. Without this, "2026-06-01" parses as UTC midnight
  // which is 05:30 IST — the first 5.5 hours of the IST day would be missed.
  const startDate = startOfIstDay(new Date(start));
  const endDate = addDays(startOfIstDay(new Date(end)), 1); // half-open
  const pivotDate = startOfIstDay(new Date(pivot));

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || Number.isNaN(pivotDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (endDate <= startDate) {
    return NextResponse.json({ error: "end must be on or after start" }, { status: 400 });
  }

  // Pre-fetch the set of delivered orderIds once. Used as a filter on
  // every subsequent SalesOrder query so cancelled / not-fulfilled /
  // RTO-tagged orders are excluded everywhere consistently.
  const deliveredOrderIds = await fetchDeliveredOrderIds();
  const deliveredFilter = {
    duplicate: 1,
    orderId: { in: deliveredOrderIds },
  };

  // Step 1: pull all delivered orders in the window.
  const inWindow = await prisma.salesOrder.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      ...deliveredFilter,
    },
    select: {
      orderId: true,
      date: true,
      customerName: true,
      mobile: true,
      shopifyCustomerId: true,
    },
    orderBy: { date: "desc" }, // newest first so "latest order" wins on display
  });

  // Step 2: unique customer identities seen in the window. Identity is
  // ALWAYS the normalized 10-digit mobile. Rows without a valid phone
  // are skipped (can't be deduplicated). This merges multiple Shopify
  // customer IDs that share a phone into one row — common when the same
  // person signed up twice with different emails.
  const identityOf = (o: { shopifyCustomerId: bigint | null; mobile: string }) => {
    const norm = normalizeMobile(o.mobile);
    return norm ? `mob:${norm}` : null;
  };

  type Acc = {
    identity: string;
    name: string;
    phone: string; // normalized phone for display
    cid: bigint | null;
    rawMobiles: Set<string>; // every raw form of the phone seen for this customer
    ordersInRange: number;
    // The most-recent order's id (because we order by date desc). Used to
    // look up the customer's latest email / display name in ShopifyOrder.
    latestOrderId: number;
  };
  const byIdentity = new Map<string, Acc>();
  for (const o of inWindow) {
    const id = identityOf(o);
    if (!id) continue;
    const existing = byIdentity.get(id);
    if (existing) {
      existing.ordersInRange += 1;
      if (o.mobile) existing.rawMobiles.add(o.mobile);
      // First sight wins (we're iterating newest-first), so existing.latestOrderId
      // is already the most recent. Just bump the count.
    } else {
      const normalized = normalizeMobile(o.mobile);
      byIdentity.set(id, {
        identity: id,
        name: o.customerName,
        phone: normalized || "",
        cid: o.shopifyCustomerId,
        rawMobiles: new Set(o.mobile ? [o.mobile] : []),
        ordersInRange: 1,
        latestOrderId: o.orderId,
      });
    }
  }

  if (byIdentity.size === 0) {
    return NextResponse.json({ start, end, pivot, customers: [] });
  }

  // Step 3: lifetime first/last + post-pivot per identity (phone-based).
  // Query by every raw mobile form seen for any in-window customer (no
  // cid carve-out anymore). Orders saved as "+919876543210" and
  // "9876543210" merge into the same lifetime totals after normalization.
  const allRawMobiles = new Set<string>();
  for (const a of byIdentity.values()) {
    for (const raw of a.rawMobiles) allRawMobiles.add(raw);
  }
  const mobiles = Array.from(allRawMobiles);

  const [mobileGroups, mobilePostCounts] = await Promise.all([
    mobiles.length
      ? prisma.salesOrder.groupBy({
          by: ["mobile"],
          where: { mobile: { in: mobiles }, ...deliveredFilter },
          _min: { date: true },
          _max: { date: true },
          _count: { _all: true },
          _sum: { qty: true, total: true },
        })
      : Promise.resolve([]),
    mobiles.length
      ? prisma.salesOrder.groupBy({
          by: ["mobile"],
          where: {
            mobile: { in: mobiles },
            date: { gte: pivotDate },
            ...deliveredFilter,
          },
          _count: { _all: true },
          _sum: { qty: true, total: true },
        })
      : Promise.resolve([]),
  ]);

  // Merge groupBy results into the normalized identity space. Multiple raw
  // mobile groups can map to the same identity (the "+91..." / "..." case),
  // so first/last/count get min/max/sum-merged.
  const lifetime = new Map<string, { first: Date; last: Date; count: number; units: number; revenue: number }>();
  const mergeLifetime = (key: string, first: Date, last: Date, count: number, units: number, revenue: number) => {
    const existing = lifetime.get(key);
    if (!existing) {
      lifetime.set(key, { first, last, count, units, revenue });
      return;
    }
    if (first < existing.first) existing.first = first;
    if (last > existing.last) existing.last = last;
    existing.count += count;
    existing.units += units;
    existing.revenue += revenue;
  };
  for (const r of mobileGroups) {
    if (r.mobile && r._min.date && r._max.date) {
      const norm = normalizeMobile(r.mobile);
      if (!norm) continue;
      mergeLifetime(`mob:${norm}`, r._min.date, r._max.date, r._count._all, r._sum.qty ?? 0, r._sum.total ?? 0);
    }
  }

  const postCounts = new Map<string, number>();
  const postUnits = new Map<string, number>();
  const postRevenue = new Map<string, number>();
  const addPost = (key: string, count: number, units: number, revenue: number) => {
    postCounts.set(key, (postCounts.get(key) ?? 0) + count);
    postUnits.set(key, (postUnits.get(key) ?? 0) + units);
    postRevenue.set(key, (postRevenue.get(key) ?? 0) + revenue);
  };
  for (const r of mobilePostCounts) {
    if (r.mobile) {
      const norm = normalizeMobile(r.mobile);
      if (!norm) continue;
      addPost(`mob:${norm}`, r._count._all, r._sum.qty ?? 0, r._sum.total ?? 0);
    }
  }

  // Step 4: email + canonical display data from ShopifyOrder using the LATEST
  // order id so the displayed name/email reflects the customer's most recent
  // checkout (in case they updated email or name).
  const orderIds = Array.from(byIdentity.values()).map((a) => a.latestOrderId);
  const shopifyRows = orderIds.length
    ? await prisma.shopifyOrder.findMany({
        where: { orderNumber: { in: orderIds } },
        select: { orderNumber: true, email: true, customerName: true, phone: true },
      })
    : [];
  const shopifyByOrder = new Map(shopifyRows.map((r) => [r.orderNumber, r]));

  // Step 5: assemble + tag.
  const customers: CustomerRow[] = Array.from(byIdentity.values())
    .map((a) => {
      const life = lifetime.get(a.identity);
      // Customers with cid/mobile but no lifetime row (shouldn't happen after
      // the filter — they wouldn't be in the window either — but be safe).
      if (!life) return null;
      const shop = shopifyByOrder.get(a.latestOrderId);
      // Prefer Shopify's phone (more often canonical) but normalize before
      // showing; fall back to the customer's normalized in-window phone.
      const shopPhone = normalizeMobile(shop?.phone);
      return {
        identity: a.identity,
        name: shop?.customerName || a.name,
        phone: shopPhone || a.phone,
        email: shop?.email ?? null,
        ordersInRange: a.ordersInRange,
        lifetimeOrders: life.count,
        lifetimeUnits: life.units,
        lifetimeRevenue: life.revenue,
        firstOrderDate: formatIstYmd(life.first),
        lastOrderDate: formatIstYmd(life.last),
        firstTag: life.first < pivotDate ? "pre" : "post",
        lastTag: life.last < pivotDate ? "pre" : "post",
        postPivotOrders: postCounts.get(a.identity) ?? 0,
        postPivotUnits: postUnits.get(a.identity) ?? 0,
        postPivotRevenue: postRevenue.get(a.identity) ?? 0,
      } satisfies CustomerRow;
    })
    .filter((c): c is CustomerRow => c !== null);

  // Sort by most orders in the range, then by name.
  customers.sort((a, b) => b.ordersInRange - a.ordersInRange || a.name.localeCompare(b.name));

  return NextResponse.json({ start, end, pivot, customers });
}
