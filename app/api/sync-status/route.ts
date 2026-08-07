import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Returns the last sync time for each data source, used by the sidebar
// "Last sync" widget. Shopify uses the SyncLog table; Meta uses the max
// syncedAt across its core tables (most recent sync of campaigns / ad-sets /
// ads / daily insights).
export async function GET() {
  // Report the last SUCCESSFUL sync, not the last attempt. The widget used to
  // take the newest row regardless of status and fall back to startedAt when
  // completedAt was null — so a run that failed 30 seconds ago rendered as
  // "30s ago" and a multi-day stall looked perfectly healthy.
  const [shopifyLast, shopifyLatestAttempt, metaCampaign, metaAdSet, metaAd, metaAdDaily] =
    await Promise.all([
      prisma.syncLog.findFirst({
        where: { status: "completed", completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
      }),
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

  // Surfaced so the UI can warn when syncs are currently failing even though
  // the last success is recent.
  const lastAttemptFailed = shopifyLatestAttempt?.status === "failed";

  return NextResponse.json({
    shopify: shopifyLast
      ? {
          lastSyncAt: shopifyLast.completedAt,
          status: shopifyLast.status,
          lastAttemptStatus: shopifyLatestAttempt?.status ?? null,
          lastAttemptAt: shopifyLatestAttempt?.startedAt ?? null,
          lastAttemptFailed,
        }
      : null,
    meta: metaLast ? { lastSyncAt: metaLast } : null,
  });
}
