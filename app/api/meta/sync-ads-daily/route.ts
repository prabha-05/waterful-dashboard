import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchAdDailyInsights } from "@/lib/meta";

export const maxDuration = 300;

interface MetaActionEntry {
  action_type: string;
  value: string;
}

function pickValue(
  actions: MetaActionEntry[] | undefined,
  preferred = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]
): number {
  if (!actions || actions.length === 0) return 0;
  for (const t of preferred) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) return parseFloat(hit.value || "0");
  }
  return 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get("token");
  const headerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/, "");
  const token = queryToken ?? headerToken;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysBack = Math.max(1, Math.min(parseInt(searchParams.get("days") ?? "30", 10), 90));
  const t0 = Date.now();

  // Date window
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const untilDate = new Date();

  // 1. Load all known ads into Map<metaAdId, dbId> in one query
  const ads = await prisma.metaAd.findMany({ select: { id: true, metaAdId: true } });
  const adMap = new Map(ads.map((a) => [a.metaAdId, a.id]));
  const tAdsLoaded = Date.now();

  // 2. Fetch all daily insights from Meta
  const insights = await fetchAdDailyInsights(sinceDate, untilDate);
  const tInsightsFetched = Date.now();

  // 3. Build rows, dropping any that don't match a known ad
  const now = new Date();
  const rows: Array<{
    adId: number;
    date: Date;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    video3sViews: number;
    videoP75Views: number;
    purchases: number;
    purchaseValue: number;
    qualityRanking: string | null;
    engagementRateRanking: string | null;
    conversionRateRanking: string | null;
    syncedAt: Date;
  }> = [];
  let skipped = 0;

  for (const ins of insights) {
    const adId = adMap.get(ins.ad_id);
    if (!adId) {
      skipped++;
      continue;
    }
    const date = new Date(`${ins.date_start}T00:00:00Z`);
    rows.push({
      adId,
      date,
      spend: parseFloat(ins.spend || "0"),
      impressions: parseInt(ins.impressions || "0", 10),
      reach: parseInt(ins.reach || "0", 10),
      clicks: parseInt(ins.clicks || "0", 10),
      ctr: parseFloat(ins.ctr || "0"),
      cpc: parseFloat(ins.cpc || "0"),
      cpm: parseFloat(ins.cpm || "0"),
      frequency: parseFloat(ins.frequency || "0"),
      // Meta v22 removed video_3_sec_watched_actions — derive from actions[video_view]
      // which represents 3+ second views in current schema.
      video3sViews: Math.round(pickValue(ins.actions, ["video_view"])),
      videoP75Views: Math.round(pickValue(ins.video_p75_watched_actions, ["video_view"])),
      purchases: Math.round(pickValue(ins.actions)),
      purchaseValue: pickValue(ins.action_values),
      qualityRanking: ins.quality_ranking ?? null,
      engagementRateRanking: ins.engagement_rate_ranking ?? null,
      conversionRateRanking: ins.conversion_rate_ranking ?? null,
      syncedAt: now,
    });
  }
  const tRowsBuilt = Date.now();

  // 4. Bulk replace: delete rows in window, then createMany
  // Window for delete is the IST-day-aligned date keys we're inserting.
  // Simpler: collect distinct dates from our rows and delete those exact rows
  // before re-inserting. This avoids any tz drift.
  const distinctDates = Array.from(new Set(rows.map((r) => r.date.toISOString())));
  const distinctDateValues = distinctDates.map((s) => new Date(s));

  if (distinctDateValues.length > 0) {
    await prisma.metaAdDaily.deleteMany({
      where: { date: { in: distinctDateValues } },
    });
  }
  const tDeleted = Date.now();

  // createMany in chunks of 1000
  let written = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const res = await prisma.metaAdDaily.createMany({ data: chunk, skipDuplicates: true });
    written += res.count;
  }
  const tWritten = Date.now();

  return NextResponse.json({
    success: true,
    daysBack,
    counts: {
      adsKnown: adMap.size,
      insightsFetched: insights.length,
      rowsToWrite: rows.length,
      skippedUnknownAds: skipped,
      written,
      distinctDates: distinctDates.length,
    },
    timings: {
      adsLoadMs: tAdsLoaded - t0,
      metaFetchMs: tInsightsFetched - tAdsLoaded,
      transformMs: tRowsBuilt - tInsightsFetched,
      deleteMs: tDeleted - tRowsBuilt,
      writeMs: tWritten - tDeleted,
      totalMs: tWritten - t0,
    },
  });
}
