import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchAllOrders, ShopifyOrderRaw } from "@/lib/shopify";

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

async function syncOrders() {
  // Find the last successful sync to do incremental fetch
  const lastSync = await prisma.syncLog.findFirst({
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
        syncedAt: new Date(),
      };

      if (existing) {
        await prisma.shopifyOrder.update({
          where: { shopifyId: BigInt(order.id) },
          data: orderData,
        });

        // Replace line items
        await prisma.shopifyLineItem.deleteMany({
          where: { orderId: existing.id },
        });

        await prisma.shopifyLineItem.createMany({
          data: order.line_items.map((li) => ({
            shopifyId: BigInt(li.id),
            orderId: existing.id,
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

        updated++;
      } else {
        const created = await prisma.shopifyOrder.create({
          data: orderData,
        });

        await prisma.shopifyLineItem.createMany({
          data: order.line_items.map((li) => ({
            shopifyId: BigInt(li.id),
            orderId: created.id,
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

        added++;
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

    return { success: true, ordersAdded: added, ordersUpdated: updated, total: orders.length };
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

// GET for easy manual trigger during dev (also checks CRON_SECRET if set)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && token !== cronSecret) {
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
