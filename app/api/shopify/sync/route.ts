import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { fetchAllOrders, ShopifyOrderRaw } from "@/lib/shopify";
import { auth } from "@/lib/auth";

// Allow this serverless function up to 60s on Vercel (Hobby max).
// Default 10s isn't enough when Neon is sleeping + cold-start + actual sync work.
export const maxDuration = 60;

// Stop processing and return a clean summary before the platform kills us
// mid-order. A killed invocation writes no completion record, which is what
// turned single timeouts into multi-day stalls.
const TIME_BUDGET_MS = 45_000;

// Orders are written in chunks; each chunk's SalesOrder mirror rows are
// written immediately after it. Previously the mirror ran once at the very
// end, so a timeout left orders in ShopifyOrder but absent from the dashboard.
const CHUNK_SIZE = 25;

// Hard cap on how many orders one invocation will pull from Shopify.
const MAX_ORDERS_FETCH = 2000;

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

// Shopify order → ShopifyOrder row. Pulled out of the sync loop so the same
// shape feeds both the create and update halves of a single upsert.
function buildOrderData(order: ShopifyOrderRaw) {
  const f = order.fulfillments?.[0];
  const carrier = f ? (f.tracking_company || "").trim() || null : null;
  const trackingNumber = f
    ? (f.tracking_number || f.tracking_numbers?.[0] || "").trim() || null
    : null;
  const isDtdc = carrier ? /dtdc/i.test(carrier) : false;

  return {
    shopifyId: BigInt(order.id),
    orderNumber: order.order_number,
    email: order.email ?? null,
    customerName: customerName(order),
    // Phone priority: top-level order.phone (Shopify's canonical aggregator)
    // → shipping address → customer profile → billing. The top-level field is
    // the most reliably populated; customer.phone is null unless the buyer
    // saved it in their account profile.
    phone:
      order.phone ??
      order.shipping_address?.phone ??
      order.customer?.phone ??
      order.billing_address?.phone ??
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
    totalDiscounts: order.total_discounts ? parseFloat(order.total_discounts) : null,
    landingSite: order.landing_site ?? null,
    referringSite: order.referring_site ?? null,
    sourceName: order.source_name ?? null,
    sourceIdentifier: order.source_identifier ?? null,
    noteAttributes:
      order.note_attributes && order.note_attributes.length > 0
        ? JSON.stringify(order.note_attributes)
        : null,
    // Fulfillment tracking — first fulfillment (single-parcel D2C is the
    // norm). dtdcAwb is set only when the carrier matches DTDC, keeping the
    // column clean for the DTDC sync job to pick up.
    carrier,
    dtdcAwb: isDtdc ? trackingNumber : null,
    fulfilledAt: f ? parseDate(f.created_at ?? null) : null,
    syncedAt: new Date(),
  };
}

// Rewrite the SalesOrder mirror rows for one batch of orders. Called per
// chunk rather than once at the end so a timeout can never leave orders
// written to ShopifyOrder but missing from the table the dashboard reads.
async function writeSalesRows(orders: ShopifyOrderRaw[]): Promise<number> {
  if (orders.length === 0) return 0;

  const orderNumbers = orders.map((o) => o.order_number);
  // Shopify is source of truth — re-syncs replace any prior rows.
  await prisma.salesOrder.deleteMany({ where: { orderId: { in: orderNumbers } } });

  const salesRows = [];

  for (const order of orders) {
    const orderDate = parseDate(order.processed_at) ?? new Date(order.created_at);
    const monthLabel = orderDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    // Phone only — customer profile, then shipping/billing addresses (usually
    // populated even when customer.phone is null for express checkout).
    // Falling back to email would corrupt the column's meaning: downstream
    // pivot-cohort logic normalizes this as a phone number.
    const mobile =
      order.customer?.phone || order.shipping_address?.phone || order.billing_address?.phone || "";
    const shopifyCustomerId = order.customer?.id ? BigInt(order.customer.id) : null;
    const cName = customerName(order);
    // Mark voided / refunded as cancelled so the dashboard's "cancel" string match catches them
    const fs = (order.financial_status ?? "").toLowerCase();
    const isVoided = fs === "voided";
    const isRefunded = fs === "refunded" || fs === "partially_refunded";
    const status =
      order.cancelled_at || isVoided || isRefunded ? "cancelled" : order.financial_status ?? "";
    const billingCity = order.billing_address?.city ?? "";
    const billingState = order.billing_address?.province ?? "";
    const pincode = order.billing_address?.zip ?? "";
    const paymentMethod =
      order.payment_gateway_names && order.payment_gateway_names.length > 0
        ? order.payment_gateway_names.join(", ")
        : null;

    const base = {
      month: monthLabel,
      duplicate: 1,
      orderId: order.order_number,
      date: orderDate,
      customerName: cName,
      mobile,
      shopifyCustomerId,
      billingCity,
      pincode,
      billingState,
      status,
      paymentMethod,
    };

    // Defensive: an order with zero line items still gets one placeholder row
    // so it isn't silently dropped from totals. /api/shopify/mirror does the same.
    if (order.line_items.length === 0) {
      salesRows.push({ ...base, flavour: "(no line items)", qty: 0, total: parseFloat(order.total_price) });
      continue;
    }

    // Scale per-line totals so their sum equals Shopify's total_price exactly.
    // subtotalPrice is already post-order-level-discount, so raw line totals
    // overshoot when a discount code like WELCOME10 was used.
    const orderTotalPrice = parseFloat(order.total_price);
    const lineGrossSum = order.line_items.reduce(
      (s, li) => s + parseFloat(li.price) * li.quantity - parseFloat(li.total_discount || "0"),
      0,
    );
    const lineScale = lineGrossSum > 0 ? orderTotalPrice / lineGrossSum : 1;

    for (const li of order.line_items) {
      const lineGross = parseFloat(li.price) * li.quantity - parseFloat(li.total_discount || "0");
      salesRows.push({
        ...base,
        flavour: [li.title, li.variant_title].filter(Boolean).join(" — "),
        qty: li.quantity,
        total: lineGross * lineScale,
      });
    }
  }

  if (salesRows.length === 0) return 0;
  await prisma.salesOrder.createMany({ data: salesRows });
  return salesRows.length;
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

async function syncOrders(force: boolean = false, sinceOverride?: Date, lookbackHours: number = 2) {
  const startedAtMs = Date.now();
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

  // Find the last successful sync to do incremental fetch (unless forcing full).
  //
  // Why we cap the lookback: when a sync fails on Vercel (60s function
  // timeout), `completedAt` never gets written, so the next attempt sees
  // a much older "last successful sync" and tries to re-pull everything
  // since then. That re-pull also times out, perpetuating the failure.
  //
  // We never look back further than `lookbackHours` even if the last
  // successful sync was older. Each cron run pulls a small, predictable
  // window. Caller (GET handler) chooses the value: 2h for hourly crons,
  // 26h for the daily cron that needs to cover a full day's orders.
  const lastSync = force
    ? null
    : await prisma.syncLog.findFirst({
        where: { status: "completed" },
        orderBy: { completedAt: "desc" },
      });

  const lookbackCutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  // Self-healing incremental window.
  //
  // The old logic started from whichever was MORE RECENT of (last successful
  // sync, lookbackCutoff), i.e. the shorter lookback. So if the sync ever
  // stopped running for longer than `lookbackHours` (a failed daily cron, a
  // Neon outage), the orders in that gap were skipped permanently: the next
  // run only looked back `lookbackHours` and never reached back to them.
  //
  // Instead, anchor to the last SUCCESSFUL sync so a stalled or failed run
  // self-heals — the next run re-pulls everything updated since we were last
  // known-good, closing the hole. We still look back at least `lookbackHours`
  // (to catch late edits to recent orders), and clamp how far back we reach so
  // an ancient anchor can't trigger a giant re-pull that blows the 60s function
  // timeout. Gaps larger than the clamp are covered by the manual `?since=`
  // backfill.
  const MAX_CATCHUP_DAYS = 4;
  const catchupFloor = new Date(Date.now() - MAX_CATCHUP_DAYS * 24 * 60 * 60 * 1000);
  const lastCovered = lastSync?.completedAt ?? lookbackCutoff;
  // Earlier of (last successful sync, standard lookback) → covers the gap AND
  // the recent-edit window.
  let sinceDate = lastCovered < lookbackCutoff ? lastCovered : lookbackCutoff;
  if (sinceDate < catchupFloor) {
    console.warn(
      `[shopify/sync] Gap since last successful sync (${lastCovered.toISOString()}) ` +
        `exceeds ${MAX_CATCHUP_DAYS}d cap — clamping to ${catchupFloor.toISOString()}. ` +
        `Run ?since=YYYY-MM-DD to backfill older orders.`,
    );
    sinceDate = catchupFloor;
  }

  const log = await prisma.syncLog.create({
    data: { status: "running" },
  });

  try {
    // sinceOverride uses created_at_min (cohort backfill); default uses
    // updated_at_min from last successful sync (incremental).
    const orders = sinceOverride
      ? await fetchAllOrders(sinceOverride, 250, true, MAX_ORDERS_FETCH)
      : await fetchAllOrders(sinceDate, 250, false, MAX_ORDERS_FETCH);

    // Bulk-load what we already hold so unchanged orders cost nothing. A bulk
    // fulfilment batch bumps updated_at on hundreds of already-synced orders;
    // without this, every run redid all of that work and blew the 60s budget.
    //
    // This doubles as the resume mechanism: an order we managed to write stays
    // written, so the next run skips it here and moves on to the ones we never
    // reached. Progress lives in the data itself, so there is no cursor to
    // maintain and Shopify's page ordering does not matter.
    const incomingIds = orders.map((o) => BigInt(o.id));
    const existingRows = incomingIds.length
      ? await prisma.shopifyOrder.findMany({
          where: { shopifyId: { in: incomingIds } },
          select: { shopifyId: true, updatedAt: true },
        })
      : [];
    const seenUpdatedAt = new Map(
      existingRows.map((r) => [r.shopifyId.toString(), r.updatedAt.getTime()]),
    );

    const pending = force
      ? orders
      : orders.filter(
          (o) => seenUpdatedAt.get(String(o.id)) !== new Date(o.updated_at).getTime(),
        );

    let added = 0;
    let updated = 0;
    let salesRowsWritten = 0;
    let processed = 0;
    let stoppedEarly = false;

    for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
      if (Date.now() - startedAtMs > TIME_BUDGET_MS) {
        stoppedEarly = true;
        break;
      }
      const chunk = pending.slice(i, i + CHUNK_SIZE);

      for (const order of chunk) {
        const orderData = buildOrderData(order);
        // One upsert instead of findUnique followed by create/update.
        const orderRow = await prisma.shopifyOrder.upsert({
          where: { shopifyId: BigInt(order.id) },
          create: orderData,
          update: orderData,
        });

        // Delete any prior line items for this order AND any orphan rows that
        // share the same lineItem.shopifyId (from interrupted past syncs).
        // Paired with createMany in a transaction so a Neon disconnect between
        // the two can't leave the order with zero line items.
        const incomingLineItemIds = order.line_items.map((li) => BigInt(li.id));
        const deleteOp = prisma.shopifyLineItem.deleteMany({
          where: {
            OR: [{ orderId: orderRow.id }, { shopifyId: { in: incomingLineItemIds } }],
          },
        });

        if (order.line_items.length > 0) {
          const createOp = prisma.shopifyLineItem.createMany({
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
          await prisma.$transaction([deleteOp, createOp]);
        } else {
          await deleteOp;
        }

        if (seenUpdatedAt.has(String(order.id))) updated++;
        else added++;
        processed++;
      }

      // Mirror this chunk right away rather than once at the end, so a
      // timeout can't strand orders outside the table the dashboard reads.
      salesRowsWritten += await writeSalesRows(chunk);
    }

    const fullyProcessed = !stoppedEarly && processed === pending.length;

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: fullyProcessed ? "completed" : "partial",
        // Only a complete pass advances the anchor. A partial run leaves the
        // last-known-good mark where it was, so the next run's window still
        // covers what it missed — and those orders are now cheap to skip.
        completedAt: fullyProcessed ? new Date() : null,
        ordersAdded: added,
        ordersUpdated: updated,
        error: fullyProcessed
          ? null
          : `Stopped early after ${processed}/${pending.length} changed orders — next run resumes`,
      },
    });

    return {
      success: true,
      ordersAdded: added,
      ordersUpdated: updated,
      salesRowsWritten,
      total: orders.length,
      changed: pending.length,
      processed,
      remaining: pending.length - processed,
      stoppedEarly,
      elapsedMs: Date.now() - startedAtMs,
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
  // Optional: backfill from a specific date (YYYY-MM-DD). Uses created_at_min
  // so we only pull orders created after this date, not orders edited after.
  const sinceParam = searchParams.get("since");
  const sinceOverride = sinceParam ? new Date(`${sinceParam}T00:00:00Z`) : undefined;

  // How far back to look for changed orders. Defaults to 2h so hourly
  // crons stay fast and never time out. The daily 21:00 UTC Vercel cron
  // passes ?lookbackHours=26 to cover the whole day. Max 26 hours.
  const lookbackParam = searchParams.get("lookbackHours");
  const lookbackHours = lookbackParam
    ? Math.max(1, Math.min(26, parseInt(lookbackParam, 10)))
    : 2;

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token !== cronSecret) {
    // Not a valid cron token — allow if the caller is a logged-in dashboard
    // user (NextAuth session cookie). This lets the dashboard's "Refresh from
    // Shopify" button trigger a sync without shipping CRON_SECRET to the browser.
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (wait) {
    // Inline mode — block until sync finishes (manual debugging)
    try {
      const result = await syncOrders(force, sinceOverride, lookbackHours);
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
      await syncOrders(force, sinceOverride, lookbackHours);
    } catch (err) {
      console.error("[shopify/sync] Background sync failed:", err);
    }
  });

  return NextResponse.json({
    accepted: true,
    message: "Sync started in background. Check /api/shopify/status for result.",
  });
}
