import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// One-shot endpoint: walks the ShopifyOrder + ShopifyLineItem tables and
// creates matching SalesOrder rows so the dashboard pages can read them.
// Does NOT re-fetch from Shopify — purely a DB-to-DB transform. Idempotent.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const queryToken = req.nextUrl.searchParams.get("token");
  const headerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/, "");
  const token = queryToken ?? headerToken;
  if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbOrders = await prisma.shopifyOrder.findMany({
    include: { lineItems: true },
  });

  if (dbOrders.length === 0) {
    return NextResponse.json({
      message: "No ShopifyOrder rows to mirror — run /api/shopify/sync first",
      shopifyOrders: 0,
      salesRows: 0,
    });
  }

  const orderNumbers = dbOrders.map((o) => o.orderNumber);
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

  for (const dbOrder of dbOrders) {
    const orderDate = dbOrder.processedAt ?? dbOrder.createdAt;
    const monthLabel = orderDate.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    // Customer identity: phone preferred, fall back to email so phoneless
    // orders aren't hidden by the dashboard's `mobile != ""` filter.
    const mobile = dbOrder.phone || dbOrder.email || "";
    // Treat cancelled / voided / refunded all as cancelled so the dashboard's
    // status.includes("cancel") logic catches them.
    const fs = dbOrder.financialStatus.toLowerCase();
    const isVoided = fs === "voided";
    const isRefunded = fs === "refunded" || fs === "partially_refunded";
    const status =
      dbOrder.cancelledAt || isVoided || isRefunded
        ? "cancelled"
        : dbOrder.financialStatus;

    for (const li of dbOrder.lineItems) {
      const flavour = [li.title, li.variantTitle].filter(Boolean).join(" — ");
      const lineTotal = li.price * li.quantity - li.totalDiscount;

      salesRows.push({
        month: monthLabel,
        duplicate: 1,
        orderId: dbOrder.orderNumber,
        date: orderDate,
        flavour,
        qty: li.quantity,
        customerName: dbOrder.customerName,
        mobile,
        billingCity: dbOrder.billingCity ?? "",
        pincode: dbOrder.billingZip ?? "",
        billingState: dbOrder.billingState ?? "",
        total: lineTotal,
        status,
        paymentMethod: dbOrder.paymentGatewayNames,
      });
    }
  }

  if (salesRows.length > 0) {
    await prisma.salesOrder.createMany({ data: salesRows });
  }

  return NextResponse.json({
    message: "Mirror complete",
    shopifyOrders: dbOrders.length,
    salesRows: salesRows.length,
  });
}
