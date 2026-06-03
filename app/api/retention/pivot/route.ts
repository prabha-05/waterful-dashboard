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
  firstOrderDate: string;
  lastOrderDate: string;
  firstTag: "pre" | "post";
  lastTag: "pre" | "post";
  postPivotOrders: number;
};

// Active-order filter — applied everywhere (in-window pull, lifetime min/max,
// post-pivot count) so the same orders count in every dimension. Without this
// the lifetime "first order" could be a cancelled row from years ago and the
// Pre/Post tag would be wrong.
const ACTIVE_ORDER_FILTER = {
  duplicate: 1,
  NOT: { status: { contains: "cancel", mode: "insensitive" as const } },
};

// Normalize Indian mobile numbers so the same customer doesn't show up twice
// just because one order saved "+919427729739" and another "9427729739".
// Also reject values that look like emails (Shopify imports occasionally place
// the email in the phone field). Returns "" when the value isn't a phone.
function normalizeMobile(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s || s.includes("@")) return "";
  // Strip all non-digits — drops "+", spaces, hyphens, parens.
  s = s.replace(/\D/g, "");
  // Indian mobiles: drop leading country code "91" (12 → 10 digits).
  if (s.length === 12 && s.startsWith("91")) s = s.slice(2);
  // Drop leading "0" some POS systems prefix.
  if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
  // Anything that isn't 10 digits is suspicious — treat as not-a-phone.
  if (s.length !== 10) return "";
  return s;
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

  // Step 1: pull all active orders in the window.
  const inWindow = await prisma.salesOrder.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      ...ACTIVE_ORDER_FILTER,
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
  // cid:X when Shopify gave us a customer.id; otherwise mob:<normalized 10
  // digit phone>. Rows that have neither a cid nor a valid phone are dropped.
  // We also track all RAW mobile strings that map to each identity — needed
  // later for DB queries that filter by raw mobile.
  const identityOf = (o: { shopifyCustomerId: bigint | null; mobile: string }) => {
    if (o.shopifyCustomerId) return `cid:${o.shopifyCustomerId}`;
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

  // Step 3: lifetime first/last + post-pivot count per identity. Filter same
  // way as the in-window pull (active orders only) so totals stay consistent.
  const cids = Array.from(byIdentity.values())
    .map((a) => a.cid)
    .filter((c): c is bigint => c != null);
  // For mobile-only identities, query by ALL raw forms of the phone — we may
  // have rows with "+919999..." and "9999..." that are really the same person.
  const allRawMobiles = new Set<string>();
  for (const a of byIdentity.values()) {
    if (a.cid != null) continue;
    for (const raw of a.rawMobiles) allRawMobiles.add(raw);
  }
  const mobiles = Array.from(allRawMobiles);

  const [cidGroups, mobileGroups, cidPostCounts, mobilePostCounts] = await Promise.all([
    cids.length
      ? prisma.salesOrder.groupBy({
          by: ["shopifyCustomerId"],
          where: { shopifyCustomerId: { in: cids }, ...ACTIVE_ORDER_FILTER },
          _min: { date: true },
          _max: { date: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    mobiles.length
      ? prisma.salesOrder.groupBy({
          by: ["mobile"],
          where: { mobile: { in: mobiles }, shopifyCustomerId: null, ...ACTIVE_ORDER_FILTER },
          _min: { date: true },
          _max: { date: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    cids.length
      ? prisma.salesOrder.groupBy({
          by: ["shopifyCustomerId"],
          where: {
            shopifyCustomerId: { in: cids },
            date: { gte: pivotDate },
            ...ACTIVE_ORDER_FILTER,
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
            ...ACTIVE_ORDER_FILTER,
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  // Merge groupBy results into the normalized identity space. Multiple raw
  // mobile groups can map to the same identity (the "+91..." / "..." case),
  // so first/last/count get min/max/sum-merged.
  const lifetime = new Map<string, { first: Date; last: Date; count: number }>();
  const mergeLifetime = (key: string, first: Date, last: Date, count: number) => {
    const existing = lifetime.get(key);
    if (!existing) {
      lifetime.set(key, { first, last, count });
      return;
    }
    if (first < existing.first) existing.first = first;
    if (last > existing.last) existing.last = last;
    existing.count += count;
  };
  for (const r of cidGroups) {
    if (r.shopifyCustomerId && r._min.date && r._max.date) {
      mergeLifetime(`cid:${r.shopifyCustomerId}`, r._min.date, r._max.date, r._count._all);
    }
  }
  for (const r of mobileGroups) {
    if (r.mobile && r._min.date && r._max.date) {
      const norm = normalizeMobile(r.mobile);
      if (!norm) continue;
      mergeLifetime(`mob:${norm}`, r._min.date, r._max.date, r._count._all);
    }
  }

  const postCounts = new Map<string, number>();
  const addPost = (key: string, count: number) => {
    postCounts.set(key, (postCounts.get(key) ?? 0) + count);
  };
  for (const r of cidPostCounts) {
    if (r.shopifyCustomerId) addPost(`cid:${r.shopifyCustomerId}`, r._count._all);
  }
  for (const r of mobilePostCounts) {
    if (r.mobile) {
      const norm = normalizeMobile(r.mobile);
      if (!norm) continue;
      addPost(`mob:${norm}`, r._count._all);
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
        firstOrderDate: formatIstYmd(life.first),
        lastOrderDate: formatIstYmd(life.last),
        firstTag: life.first < pivotDate ? "pre" : "post",
        lastTag: life.last < pivotDate ? "pre" : "post",
        postPivotOrders: postCounts.get(a.identity) ?? 0,
      } satisfies CustomerRow;
    })
    .filter((c): c is CustomerRow => c !== null);

  // Sort by most orders in the range, then by name.
  customers.sort((a, b) => b.ordersInRange - a.ordersInRange || a.name.localeCompare(b.name));

  return NextResponse.json({ start, end, pivot, customers });
}
