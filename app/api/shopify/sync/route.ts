import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { fetchAllOrders, ShopifyOrderRaw } from "@/lib/shopify";

// Allow this serverless function up to 60s on Vercel (Hobby max).
// Default 10s isn't enough when Neon is sleeping + cold-start + actual sync work.
export const maxDuration = 60;

function parseDate(val?: string | null): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function customerName(order: ShopifyOrderRaw): string {
  const c = order.customer;
  if (!c) return "Unknown";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
}

// Retry wrapper for the first DB calls — Neon free tier auto-sleeps after
// 5 min of inactivity, and the first connection while it's waking up can
// fail with "Can't reach database server". Up to 30s of retries handles it.
async function withDbRetry<T>(fn: () => Promise<T>, attempts = 6, baseDelayMs = 1500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs + i * 1500));
      }
    }
  }
  throw lastErr;
}

async function syncOrders(force: boolean = false) {
  // Refuse to start if another sync is genuinely in progress (within last 3 min).
  // Window is short because the SyncLog status field is unreliable — Neon drops
  // long connections so the final "completed" update sometimes doesn't persist.
  // Real concurrent syncs (two cron triggers racing) only overlap by seconds,
  // so 3 min is plenty to catch actual races without punishing stuck rows.
  const STUCK_THRESHOLD_MS = 3 * 60 * 1000;
  const inProgress = await withDbRetry(() =>
    prisma.syncLog.findFirst({
      where: {
        status: "running",
        startedAt: { gte: new Date(Date.now() - STUCK_THRESHOLD_MS) },
      },
      orderBy: { startedAt: "desc" },
    })
  );
  if (inProgress) {
    throw new Error(
      `Another sync is already running (started ${inProgress.startedAt.toISOString()}). Wait for it to finish or restart the dev server.`
    );
  }

  // Mark any older stuck "running" rows as failed for housekeeping
  await prisma.syncLog.updateMany({
    where: { status: "running" },
    data: { status: "failed", completedAt: new Date(), error: "Marked failed by next sync run" },
  });

  // Find the last successful sync to do incremental fetch (unless forcing full)
  const lastSync = force
    ? null
    : await prisma.syncLog.findFirst({
        where: { status: "completed" },
        orderBy: { completedAt: "desc" },
      });

  const sinceDate = lastSync?.completedAt ?? undefined;

  const log = await prisma.syncLog.create({
    data: { status: "running" },
  });

  try {
    const orders = await fetchAllOrders(sinceDate);

    let added = 0;
    let updated = 0;

    for (const order of orders) {
      const existing = await prisma.shopifyOrder.findUnique({
        where: { shopifyId: BigInt(order.id) },
      });

      const orderData = {
        shopifyId: BigInt(order.id),
        orderNumber: order.order_number,
        email: order.email ?? null,
        customerName: customerName(order),
        phone: order.customer?.phone ?? null,
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
        itemCount: order.line_items.reduce((sum, li) => sum + li.quantity, 0),
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
        totalDiscounts: order.total_discounts
          ? parseFloat(order.total_discounts)
          : null,
        syncedAt: new Date(),
      };

      // Get the resolved order row (existing update or fresh create)
      const orderRow = existing
        ? await prisma.shopifyOrder.update({
            where: { shopifyId: BigInt(order.id) },
            data: orderData,
          })
        : await prisma.shopifyOrder.create({ data: orderData });

      // Delete any prior line items for this order AND any orphan rows that
      // happen to share the same lineItem.shopifyId (from interrupted past
      // syncs). This prevents the unique-constraint crash we hit before.
      const incomingLineItemIds = order.line_items.map((li) => BigInt(li.id));
      await prisma.shopifyLineItem.deleteMany({
        where: {
          OR: [
            { orderId: orderRow.id },
            { shopifyId: { in: incomingLineItemIds } },
          ],
        },
      });

      if (order.line_items.length > 0) {
        await prisma.shopifyLineItem.createMany({
          data: order.line_items.map((li) => ({
            shopifyId: BigInt(li.id),
            orderId: orderRow.id,
            title: li.title,
            variantTitle: li.variant_title ?? null,
            sku: li.sku ?? null,
            quantity: li.quantity,
            price: parseFloat(li.price),
            totalDiscount: parseFloat(li.total_discount),
            vendor: li.vendor ?? null,
            productId: li.product_id ? BigInt(li.product_id) : null,
          })),
        });
      }

      if (existing) {
        updated++;
      } else {
        added++;
      }
    }

    // Mirror Shopify orders into SalesOrder rows so the dashboard pages
    // (Trends, Retention, Sales) can read them. SalesOrder is per-line-item
    // so each Shopify order fans out into N rows.
    let salesRowsWritten = 0;
    if (orders.length > 0) {
      const orderNumbers = orders.map((o) => o.order_number);

      // Shopify is source of truth — re-syncs replace any prior rows for these orderIds
      await prisma.salesOrder.deleteMany({
        where: { orderId: { in: orderNumbers } },
      });

      const salesRows: Array<{
        month: string;
        duplicate: number;
        orderId: number;
        date: Date;
        flavour: string;
        qty: number;
        customerName: string;
        mobile: string;
        billingCity: string;
        pincode: string;
        billingState: string;
        total: number;
        status: string;
        paymentMethod: string | null;
      }> = [];

      for (const order of orders) {
        const orderDate = parseDate(order.processed_at) ?? new Date(order.created_at);
        const monthLabel = orderDate.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });
        // Phone preferred, email fallback so phoneless orders show up
        const mobile = order.customer?.phone || order.email || "";
        const cName = customerName(order);
        // Mark voided / refunded as cancelled so the dashboard's "cancel" string match catches them
        const fs = (order.financial_status ?? "").toLowerCase();
        const isVoided = fs === "voided";
        const isRefunded = fs === "refunded" || fs === "partially_refunded";
        const status =
          order.cancelled_at || isVoided || isRefunded
            ? "cancelled"
            : order.financial_status ?? "";
        const billingCity = order.billing_address?.city ?? "";
        const billingState = order.billing_address?.province ?? "";
        const pincode = order.billing_address?.zip ?? "";
        const paymentMethod =
          order.payment_gateway_names && order.payment_gateway_names.length > 0
            ? order.payment_gateway_names.join(", ")
            : null;

        for (const li of order.line_items) {
          const flavour = [li.title, li.variant_title].filter(Boolean).join(" — ");
          const lineTotal =
            parseFloat(li.price) * li.quantity - parseFloat(li.total_discount || "0");

          salesRows.push({
            month: monthLabel,
            duplicate: 1,
            orderId: order.order_number,
            date: orderDate,
            flavour,
            qty: li.quantity,
            customerName: cName,
            mobile,
            billingCity,
            pincode,
            billingState,
            total: lineTotal,
            status,
            paymentMethod,
          });
        }
      }

      if (salesRows.length > 0) {
        await prisma.salesOrder.createMany({ data: salesRows });
        salesRowsWritten = salesRows.length;
      }
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        ordersAdded: added,
        ordersUpdated: updated,
      },
    });

    return {
      success: true,
      ordersAdded: added,
      ordersUpdated: updated,
      salesRowsWritten,
      total: orders.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "failed", completedAt: new Date(), error: message },
    });
    throw err;
  }
}

export async function POST(request: Request) {
  // Verify auth: either session-based or a secret token
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncOrders();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET for easy manual trigger during dev (also checks CRON_SECRET if set).
// Accepts auth via either ?token=<CRON_SECRET> query param or
// Authorization: Bearer <CRON_SECRET> header (Vercel Cron sends the latter).
// Pass ?full=true to ignore the incremental cutoff and re-fetch everything.
// Pass ?wait=true to wait for completion and get the result inline (manual use).
// Default behaviour returns 200 immediately and runs the sync in the
// background — keeps cron-job.org happy even on slow Neon wake-ups.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get("token");
  const headerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/, "");
  const token = queryToken ?? headerToken;
  const force = searchParams.get("full") === "true";
  const wait = searchParams.get("wait") === "true";
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (wait) {
    // Inline mode — block until sync finishes (manual debugging)
    try {
      const result = await syncOrders(force);
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Async mode — return 200 immediately, run sync in background.
  // `after()` keeps the serverless function alive after the response is sent
  // (up to maxDuration), so the sync completes server-side even after the
  // client (cron-job.org) gets its response.
  after(async () => {
    try {
      await syncOrders(force);
    } catch (err) {
      console.error("[shopify/sync] Background sync failed:", err);
    }
  });

  return NextResponse.json({
    accepted: true,
    message: "Sync started in background. Check /api/shopify/status for result.",
  });
}
