import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const lastSync = await prisma.syncLog.findFirst({
    orderBy: { startedAt: "desc" },
  });

  const orderCount = await prisma.shopifyOrder.count();

  return NextResponse.json({
    lastSync: lastSync
      ? {
          status: lastSync.status,
          startedAt: lastSync.startedAt,
          completedAt: lastSync.completedAt,
          ordersAdded: lastSync.ordersAdded,
          ordersUpdated: lastSync.ordersUpdated,
          error: lastSync.error,
        }
      : null,
    totalOrdersInDb: orderCount,
  });
}
