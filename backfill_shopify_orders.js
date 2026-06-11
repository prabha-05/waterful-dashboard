/* eslint-disable */
// One-shot Shopify historical backfill.
// Streams orders page-by-page from Shopify REST and upserts each page
// directly into Neon, bypassing the /api/shopify/sync route's syncLog
// lock so external crons hitting the endpoint don't interrupt this run.
//
// Run with: node backfill_shopify_orders.js
//
// Reads SHOPIFY_STORE_URL + SHOPIFY_ACCESS_TOKEN + DATABASE_URL from .env.

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2024-01";

if (!STORE || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN in .env");
  process.exit(1);
}

const SINCE_DATE = process.argv[2] || "2022-01-01";
console.log(`Backfilling Shopify orders since ${SINCE_DATE}T00:00:00Z`);

const prisma = new PrismaClient();

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function customerName(order) {
  const c = order.customer;
  if (!c) return "Unknown";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
}

async function fetchPage(url) {
  // Up to 5 retries on transient errors (rate limit, network blip)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
      });
      if (res.status === 429) {
        // Rate limited — Shopify says retry after Retry-After seconds
        const retryAfter = Number(res.headers.get("retry-after") || "2");
        console.log(`  rate-limited, waiting ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const linkHeader = res.headers.get("link");
      const data = await res.json();
      return { orders: data.orders, linkHeader };
    } catch (err) {
      console.log(`  fetch attempt ${attempt + 1} failed: ${err.message}. Waiting 5s`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error("Exceeded retry attempts");
}

async function orderExists(shopifyId) {
  const found = await prisma.shopifyOrder.findUnique({
    where: { shopifyId },
    select: { id: true },
  });
  return !!found;
}

async function upsertOrder(order) {
  const orderData = {
    shopifyId: BigInt(order.id),
    orderNumber: order.order_number,
    email: order.email ?? null,
    customerName: customerName(order),
    phone:
      order.phone ||
      order.shipping_address?.phone ||
      order.customer?.phone ||
      order.billing_address?.phone ||
      null,
    shopifyCustomerId: order.customer?.id ? BigInt(order.customer.id) : null,
    totalPrice: parseFloat(order.total_price),
    subtotalPrice: parseFloat(order.subtotal_price),
    totalTax: parseFloat(order.total_tax),
    currency: order.currency,
    financialStatus: order.financial_status,
    fulfillmentStatus: order.fulfillment_status ?? null,
    createdAt: new Date(order.created_at),
    updatedAt: new Date(order.updated_at),
    processedAt: parseDate(order.processed_at),
    cancelledAt: parseDate(order.cancelled_at),
    closedAt: parseDate(order.closed_at),
    billingCity: order.billing_address?.city ?? null,
    billingState: order.billing_address?.province ?? null,
    billingCountry: order.billing_address?.country ?? null,
    billingZip: order.billing_address?.zip ?? null,
    shippingCity: order.shipping_address?.city ?? null,
    shippingState: order.shipping_address?.province ?? null,
    shippingCountry: order.shipping_address?.country ?? null,
    shippingZip: order.shipping_address?.zip ?? null,
    itemCount: order.line_items.reduce((s, li) => s + li.quantity, 0),
    note: order.note ?? null,
    tags: order.tags ?? null,
    paymentGatewayNames:
      order.payment_gateway_names && order.payment_gateway_names.length > 0
        ? order.payment_gateway_names.join(", ")
        : null,
    discountCodes:
      order.discount_codes && order.discount_codes.length > 0
        ? order.discount_codes.map((d) => d.code).join(", ")
        : null,
    totalDiscounts: order.total_discounts ? parseFloat(order.total_discounts) : null,
    landingSite: order.landing_site ?? null,
    referringSite: order.referring_site ?? null,
    sourceName: order.source_name ?? null,
    sourceIdentifier: order.source_identifier ?? null,
    noteAttributes:
      order.note_attributes && order.note_attributes.length > 0
        ? JSON.stringify(order.note_attributes)
        : null,
    ...(() => {
      const f = order.fulfillments?.[0];
      if (!f) return { carrier: null, dtdcAwb: null, fulfilledAt: null };
      const carrier = (f.tracking_company || "").trim() || null;
      const trackingNumber = (f.tracking_number || f.tracking_numbers?.[0] || "").trim() || null;
      const isDtdc = carrier ? /dtdc/i.test(carrier) : false;
      return {
        carrier,
        dtdcAwb: isDtdc ? trackingNumber : null,
        fulfilledAt: parseDate(f.created_at ?? null),
      };
    })(),
    syncedAt: new Date(),
  };

  // Upsert (idempotent — safe to re-run)
  await prisma.shopifyOrder.upsert({
    where: { shopifyId: BigInt(order.id) },
    create: orderData,
    update: orderData,
  });
}

async function main() {
  const startMs = Date.now();
  let totalProcessed = 0;
  let pageNum = 0;
  const params = `limit=250&status=any&created_at_min=${encodeURIComponent(SINCE_DATE + "T00:00:00Z")}`;
  let nextUrl = `https://${STORE}/admin/api/${API_VERSION}/orders.json?${params}`;

  while (nextUrl) {
    pageNum++;
    const t0 = Date.now();
    const { orders, linkHeader } = await fetchPage(nextUrl);
    const fetchMs = Date.now() - t0;

    // Upsert each order in series — keeps Neon connection happy.
    // Skip orders we already have (avoids slow updates over the same
    // rows when resuming a partial backfill).
    const upsertT0 = Date.now();
    let skipped = 0;
    for (const order of orders) {
      try {
        if (await orderExists(BigInt(order.id))) {
          skipped++;
          totalProcessed++;
          continue;
        }
        await upsertOrder(order);
        totalProcessed++;
      } catch (err) {
        console.log(`  upsert failed for order ${order.id}: ${err.message}`);
      }
    }
    const upsertMs = Date.now() - upsertT0;

    const elapsedTotal = ((Date.now() - startMs) / 1000).toFixed(0);
    console.log(
      `[page ${pageNum}] +${orders.length} orders (skipped ${skipped}, fetch ${fetchMs}ms, upsert ${upsertMs}ms) ` +
        `→ total processed ${totalProcessed} after ${elapsedTotal}s`,
    );

    // Pagination: next URL from Link header
    nextUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) nextUrl = nextMatch[1];
    }
  }

  const totalMin = ((Date.now() - startMs) / 60000).toFixed(1);
  console.log(`\nDONE. Processed ${totalProcessed} orders across ${pageNum} pages in ${totalMin} min.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  await prisma.$disconnect();
  process.exit(1);
});
