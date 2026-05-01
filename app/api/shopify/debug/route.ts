import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopifyTotal = await prisma.shopifyOrder.count();
  const shopifyWithPaymentGateway = await prisma.shopifyOrder.count({
    where: { paymentGatewayNames: { not: null } },
  });
  const paymentGatewayBreakdown = await prisma.shopifyOrder.groupBy({
    by: ["paymentGatewayNames"],
    _count: { _all: true },
    orderBy: { _count: { paymentGatewayNames: "desc" } },
  });

  const orderIds = (
    await prisma.shopifyOrder.findMany({ select: { orderNumber: true } })
  ).map((o) => o.orderNumber);

  const salesMirrored = await prisma.salesOrder.count({
    where: { orderId: { in: orderIds } },
  });
  const salesWithPayment = await prisma.salesOrder.count({
    where: { orderId: { in: orderIds }, paymentMethod: { not: null } },
  });
  const salesPaymentBreakdown = await prisma.salesOrder.groupBy({
    by: ["paymentMethod"],
    where: { orderId: { in: orderIds } },
    _count: { _all: true },
    orderBy: { _count: { paymentMethod: "desc" } },
  });

  const sample = await prisma.shopifyOrder.findFirst({
    where: { paymentGatewayNames: { not: null } },
    select: {
      orderNumber: true,
      paymentGatewayNames: true,
      discountCodes: true,
      totalDiscounts: true,
    },
  });

  // SyncLog history — to see if any completed
  const recentLogs = await prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    syncLogs: recentLogs.map((l) => ({
      id: l.id,
      status: l.status,
      startedAt: l.startedAt,
      completedAt: l.completedAt,
      ordersAdded: l.ordersAdded,
      ordersUpdated: l.ordersUpdated,
      error: l.error,
    })),
    shopifyOrder: {
      total: shopifyTotal,
      withPaymentGatewaySet: shopifyWithPaymentGateway,
      withoutPaymentGateway: shopifyTotal - shopifyWithPaymentGateway,
      paymentGatewayBreakdown: paymentGatewayBreakdown.slice(0, 15).map((r) => ({
        gateway: r.paymentGatewayNames,
        count: r._count._all,
      })),
    },
    salesOrder: {
      total: salesMirrored,
      withPaymentMethod: salesWithPayment,
      withoutPaymentMethod: salesMirrored - salesWithPayment,
      paymentMethodBreakdown: salesPaymentBreakdown.slice(0, 15).map((r) => ({
        paymentMethod: r.paymentMethod,
        count: r._count._all,
      })),
    },
    sampleEnrichedShopifyOrder: sample,
  });
}
