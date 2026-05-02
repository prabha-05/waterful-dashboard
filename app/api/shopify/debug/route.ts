import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Latest 15 ShopifyOrder rows by createdAt
  const latestShopify = await prisma.shopifyOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      orderNumber: true,
      createdAt: true,
      processedAt: true,
      financialStatus: true,
      cancelledAt: true,
      totalPrice: true,
      phone: true,
      email: true,
      paymentGatewayNames: true,
    },
  });

  // Latest 15 SalesOrder rows by date
  const latestSales = await prisma.salesOrder.findMany({
    orderBy: { date: "desc" },
    take: 15,
    select: {
      orderId: true,
      date: true,
      flavour: true,
      mobile: true,
      total: true,
      status: true,
      paymentMethod: true,
    },
  });

  // Counts for last 3 days (UTC)
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = new Date(today.getTime() - 86400000);
  const dayBefore = new Date(today.getTime() - 2 * 86400000);
  const tomorrow = new Date(today.getTime() + 86400000);

  const shopifyToday = await prisma.shopifyOrder.count({
    where: { createdAt: { gte: today, lt: tomorrow } },
  });
  const shopifyYesterday = await prisma.shopifyOrder.count({
    where: { createdAt: { gte: yesterday, lt: today } },
  });
  const salesToday = await prisma.salesOrder.count({
    where: { date: { gte: today, lt: tomorrow } },
  });
  const salesYesterday = await prisma.salesOrder.count({
    where: { date: { gte: yesterday, lt: today } },
  });
  const salesDayBefore = await prisma.salesOrder.count({
    where: { date: { gte: dayBefore, lt: yesterday } },
  });

  // Same with mobile filter (what the dashboard actually queries)
  const salesTodayWithMobile = await prisma.salesOrder.count({
    where: { date: { gte: today, lt: tomorrow }, duplicate: 1, mobile: { not: "" } },
  });
  const salesYesterdayWithMobile = await prisma.salesOrder.count({
    where: { date: { gte: yesterday, lt: today }, duplicate: 1, mobile: { not: "" } },
  });

  // Status breakdown for the last 2 days (UTC)
  const statusBreakdownYesterday = await prisma.shopifyOrder.groupBy({
    by: ["financialStatus"],
    where: { createdAt: { gte: yesterday, lt: today } },
    _count: { _all: true },
  });
  const statusBreakdownToday = await prisma.shopifyOrder.groupBy({
    by: ["financialStatus"],
    where: { createdAt: { gte: today, lt: tomorrow } },
    _count: { _all: true },
  });

  // Cancelled-at-set count (Shopify's "cancelled" definition)
  const cancelledByCancelledAtYesterday = await prisma.shopifyOrder.count({
    where: { createdAt: { gte: yesterday, lt: today }, cancelledAt: { not: null } },
  });
  const cancelledByCancelledAtToday = await prisma.shopifyOrder.count({
    where: { createdAt: { gte: today, lt: tomorrow }, cancelledAt: { not: null } },
  });

  return NextResponse.json({
    nowUtc: now.toISOString(),
    todayUtcStart: today.toISOString(),
    counts: {
      shopifyOrder: {
        today: shopifyToday,
        yesterday: shopifyYesterday,
      },
      salesOrder_raw: {
        dayBefore: salesDayBefore,
        yesterday: salesYesterday,
        today: salesToday,
      },
      salesOrder_dashboardFiltered: {
        yesterday: salesYesterdayWithMobile,
        today: salesTodayWithMobile,
      },
    },
    statusBreakdown: {
      today: {
        cancelledAt: cancelledByCancelledAtToday,
        byFinancialStatus: statusBreakdownToday.map((r) => ({
          status: r.financialStatus,
          count: r._count._all,
        })),
      },
      yesterday: {
        cancelledAt: cancelledByCancelledAtYesterday,
        byFinancialStatus: statusBreakdownYesterday.map((r) => ({
          status: r.financialStatus,
          count: r._count._all,
        })),
      },
    },
    latestShopifyOrders: latestShopify,
    latestSalesOrders: latestSales,
  });
}
