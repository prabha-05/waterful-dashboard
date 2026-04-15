import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config();

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding: triggering Shopify order sync...\n");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    console.error(
      "Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN in .env\n" +
        "Please set these before running the seed."
    );
    process.exit(1);
  }

  // Instead of calling the API route, sync directly
  const { fetchAllOrders } = await import("../lib/shopify");

  const orders = await fetchAllOrders();
  console.log(`Fetched ${orders.length} orders from Shopify`);

  let added = 0;

  for (const order of orders) {
    const customerName = order.customer
      ? [order.customer.first_name, order.customer.last_name]
          .filter(Boolean)
          .join(" ") || "Unknown"
      : "Unknown";

    const existing = await prisma.shopifyOrder.findUnique({
      where: { shopifyId: BigInt(order.id) },
    });

    if (existing) continue; // Skip already-synced orders

    const created = await prisma.shopifyOrder.create({
      data: {
        shopifyId: BigInt(order.id),
        orderNumber: order.order_number,
        email: order.email ?? null,
        customerName,
        phone: order.customer?.phone ?? null,
        totalPrice: parseFloat(order.total_price),
        subtotalPrice: parseFloat(order.subtotal_price),
        totalTax: parseFloat(order.total_tax),
        currency: order.currency,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status ?? null,
        createdAt: new Date(order.created_at),
        updatedAt: new Date(order.updated_at),
        processedAt: order.processed_at ? new Date(order.processed_at) : null,
        cancelledAt: order.cancelled_at ? new Date(order.cancelled_at) : null,
        closedAt: order.closed_at ? new Date(order.closed_at) : null,
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
      },
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

  // Log the sync
  await prisma.syncLog.create({
    data: {
      status: "completed",
      completedAt: new Date(),
      ordersAdded: added,
      ordersUpdated: 0,
    },
  });

  console.log(`Done! ${added} new orders synced to database.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
