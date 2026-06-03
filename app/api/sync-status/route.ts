import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Returns the last sync time for each data source, used by the sidebar
// "Last sync" widget. Shopify uses the SyncLog table; Meta uses the max
// syncedAt across its core tables (most recent sync of campaigns / ad-sets /
// ads / daily insights).
export async function GET() {
  const [shopifyLast, metaCampaign, metaAdSet, metaAd, metaAdDaily] = await Promise.all([
    prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.metaCampaign.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }),
    prisma.metaAdSet.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }),
    prisma.metaAd.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }),
    prisma.metaAdDaily.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }),
  ]);

  const metaTimes: Date[] = [];
  if (metaCampaign?.syncedAt) metaTimes.push(metaCampaign.syncedAt);
  if (metaAdSet?.syncedAt) metaTimes.push(metaAdSet.syncedAt);
  if (metaAd?.syncedAt) metaTimes.push(metaAd.syncedAt);
  if (metaAdDaily?.syncedAt) metaTimes.push(metaAdDaily.syncedAt);
  const metaLast = metaTimes.length
    ? new Date(Math.max(...metaTimes.map((d) => d.getTime())))
    : null;

  return NextResponse.json({
    shopify: shopifyLast
      ? {
          lastSyncAt: shopifyLast.completedAt ?? shopifyLast.startedAt,
          status: shopifyLast.status,
        }
      : null,
    meta: metaLast ? { lastSyncAt: metaLast } : null,
  });
}
