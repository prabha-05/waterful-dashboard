import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  fetchAdDailyInsights,
  fetchAdById,
  fetchAdSetById,
  fetchCampaignById,
} from "@/lib/meta";

export const maxDuration = 60;

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
  const now = new Date();

  // Date window
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const untilDate = new Date();

  // 1. Fetch ad-level daily insights from Meta
  const insights = await fetchAdDailyInsights(sinceDate, untilDate);
  const tInsightsFetched = Date.now();

  // 2. Self-heal: ensure metadata exists for every ad/adset/campaign in insights.
  //    Cheap when nothing is missing (just the bulk lookups), expensive only
  //    when new entities appear (single-record GET per missing one).
  let backfilledCampaigns = 0;
  let backfilledAdSets = 0;
  let backfilledAds = 0;

  // Campaigns first — adsets reference campaign_id as a string, not FK,
  // but we still want campaign rows so the dashboard can show names.
  const insightCampaignIds = Array.from(new Set(insights.map((i) => i.campaign_id).filter(Boolean)));
  if (insightCampaignIds.length > 0) {
    const known = await prisma.metaCampaign.findMany({
      where: { metaCampaignId: { in: insightCampaignIds } },
      select: { metaCampaignId: true },
    });
    const knownSet = new Set(known.map((c) => c.metaCampaignId));
    const missing = insightCampaignIds.filter((id) => !knownSet.has(id));
    if (missing.length > 0) {
      const fetched = await Promise.all(missing.map((id) => fetchCampaignById(id).catch(() => null)));
      const rows = fetched
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => ({
          metaCampaignId: c.id,
          name: c.name,
          status: c.status,
          objective: c.objective ?? null,
          dailyBudget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
          lifetimeBudget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
          startTime: c.start_time ? new Date(c.start_time) : null,
          stopTime: c.stop_time ? new Date(c.stop_time) : null,
          createdTime: new Date(c.created_time),
          updatedTime: new Date(c.updated_time),
          syncedAt: now,
        }));
      if (rows.length > 0) {
        await prisma.metaCampaign.createMany({ data: rows, skipDuplicates: true });
        backfilledCampaigns = rows.length;
      }
    }
  }

  // Ad sets — needed because MetaAd.adSetId FKs MetaAdSet.id
  const insightAdSetIds = Array.from(new Set(insights.map((i) => i.adset_id).filter(Boolean)));
  if (insightAdSetIds.length > 0) {
    const known = await prisma.metaAdSet.findMany({
      where: { metaAdSetId: { in: insightAdSetIds } },
      select: { metaAdSetId: true },
    });
    const knownSet = new Set(known.map((a) => a.metaAdSetId));
    const missing = insightAdSetIds.filter((id) => !knownSet.has(id));
    if (missing.length > 0) {
      const fetched = await Promise.all(missing.map((id) => fetchAdSetById(id).catch(() => null)));
      const rows = fetched
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .map((a) => ({
          metaAdSetId: a.id,
          metaCampaignId: a.campaign_id,
          name: a.name,
          status: a.status,
          effectiveStatus: a.effective_status ?? null,
          optimizationGoal: a.optimization_goal ?? null,
          billingEvent: a.billing_event ?? null,
          dailyBudget: a.daily_budget ? parseFloat(a.daily_budget) / 100 : null,
          lifetimeBudget: a.lifetime_budget ? parseFloat(a.lifetime_budget) / 100 : null,
          targetingSummary: a.targeting ? JSON.stringify(a.targeting).slice(0, 1000) : null,
          startTime: a.start_time ? new Date(a.start_time) : null,
          endTime: a.end_time ? new Date(a.end_time) : null,
          createdTime: new Date(a.created_time),
          updatedTime: new Date(a.updated_time),
          syncedAt: now,
        }));
      if (rows.length > 0) {
        await prisma.metaAdSet.createMany({ data: rows, skipDuplicates: true });
        backfilledAdSets = rows.length;
      }
    }
  }

  // Now load adset map for ad inserts (need MetaAdSet.id — the int PK)
  const adSetRows = await prisma.metaAdSet.findMany({
    select: { id: true, metaAdSetId: true },
  });
  const adSetIdMap = new Map(adSetRows.map((a) => [a.metaAdSetId, a.id]));

  // Ads
  const insightAdIds = Array.from(new Set(insights.map((i) => i.ad_id).filter(Boolean)));
  if (insightAdIds.length > 0) {
    const known = await prisma.metaAd.findMany({
      where: { metaAdId: { in: insightAdIds } },
      select: { metaAdId: true },
    });
    const knownSet = new Set(known.map((a) => a.metaAdId));
    const missing = insightAdIds.filter((id) => !knownSet.has(id));
    if (missing.length > 0) {
      const fetched = await Promise.all(missing.map((id) => fetchAdById(id).catch(() => null)));
      const rows = fetched
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .map((a) => {
          const adSetDbId = adSetIdMap.get(a.adset_id);
          if (!adSetDbId) return null;
          let creativeType: string | null = null;
          if (a.creative?.video_id) creativeType = "video";
          else if (a.creative?.object_type) creativeType = a.creative.object_type.toLowerCase();
          else if (a.creative?.image_url || a.creative?.thumbnail_url) creativeType = "image";
          return {
            metaAdId: a.id,
            adSetId: adSetDbId,
            name: a.name,
            status: a.status,
            effectiveStatus: a.effective_status ?? null,
            creativeId: a.creative?.id ?? null,
            creativeName: a.creative?.name || a.creative?.title || null,
            creativeType,
            thumbnailUrl: a.creative?.thumbnail_url || a.creative?.image_url || null,
            previewLink: a.preview_shareable_link ?? null,
            createdTime: new Date(a.created_time),
            updatedTime: new Date(a.updated_time),
            syncedAt: now,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length > 0) {
        await prisma.metaAd.createMany({ data: rows, skipDuplicates: true });
        backfilledAds = rows.length;
      }
    }
  }
  const tBackfilled = Date.now();

  // 3. Load full ad map (now includes any backfilled ones)
  const allAds = await prisma.metaAd.findMany({ select: { id: true, metaAdId: true } });
  const adMap = new Map(allAds.map((a) => [a.metaAdId, a.id]));
  const tAdsLoaded = Date.now();

  // 4. Build daily-insight rows
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
      // Meta v22 removed video_3_sec_watched_actions — derive from actions[video_view].
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

  // 5. Bulk replace: delete rows for the dates we're writing, then bulk insert
  const distinctDates = Array.from(new Set(rows.map((r) => r.date.toISOString())));
  const distinctDateValues = distinctDates.map((s) => new Date(s));

  if (distinctDateValues.length > 0) {
    await prisma.metaAdDaily.deleteMany({
      where: { date: { in: distinctDateValues } },
    });
  }
  const tDeleted = Date.now();

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
      insightsFetched: insights.length,
      adsKnown: adMap.size,
      backfilledCampaigns,
      backfilledAdSets,
      backfilledAds,
      rowsToWrite: rows.length,
      skippedUnknownAds: skipped,
      written,
      distinctDates: distinctDates.length,
    },
    timings: {
      metaFetchMs: tInsightsFetched - t0,
      backfillMs: tBackfilled - tInsightsFetched,
      adsLoadMs: tAdsLoaded - tBackfilled,
      transformMs: tRowsBuilt - tAdsLoaded,
      deleteMs: tDeleted - tRowsBuilt,
      writeMs: tWritten - tDeleted,
      totalMs: tWritten - t0,
    },
  });
}
