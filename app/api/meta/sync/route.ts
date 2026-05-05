import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import {
  fetchAllCampaigns,
  fetchDailyInsights,
  fetchAllAdSets,
  fetchAdSetDailyInsights,
  fetchAllAds,
  fetchAdDailyInsights,
} from "@/lib/meta";

// Vercel Hobby limit. Bulk operations target <30s for Waterful-sized accounts.
export const maxDuration = 60;

interface MetaActionEntry {
  action_type: string;
  value: string;
}

function pickPurchaseValue(
  actions: MetaActionEntry[] | undefined,
  preferredTypes = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]
): number {
  if (!actions || actions.length === 0) return 0;
  for (const t of preferredTypes) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) return parseFloat(hit.value || "0");
  }
  return 0;
}

// Run promises in chunks of `concurrency`, awaiting each chunk.
async function chunkedAll<T>(items: T[], concurrency: number, fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    await Promise.all(slice.map(fn));
  }
}

async function syncMeta(daysBack: number = 30) {
  const t0 = Date.now();
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const untilDate = new Date();
  const now = new Date();

  // ─── 1. Campaigns metadata ───────────────────────────────────────
  const campaigns = await fetchAllCampaigns();
  const campaignBuilt = campaigns.map((c) => ({
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

  const existingCampaigns = await prisma.metaCampaign.findMany({
    select: { metaCampaignId: true, updatedTime: true },
  });
  const existingCampaignMap = new Map(
    existingCampaigns.map((c) => [c.metaCampaignId, c.updatedTime.getTime()])
  );
  const newCampaigns = campaignBuilt.filter((c) => !existingCampaignMap.has(c.metaCampaignId));
  // Only update if Meta says it changed
  const updateCampaigns = campaignBuilt.filter((c) => {
    const dbTime = existingCampaignMap.get(c.metaCampaignId);
    return dbTime !== undefined && dbTime !== c.updatedTime.getTime();
  });

  if (newCampaigns.length > 0) {
    await prisma.metaCampaign.createMany({ data: newCampaigns, skipDuplicates: true });
  }
  await chunkedAll(updateCampaigns, 25, (c) =>
    prisma.metaCampaign.update({ where: { metaCampaignId: c.metaCampaignId }, data: c })
  );

  // ─── 2. Campaign daily insights ──────────────────────────────────
  const campaignInsights = await fetchDailyInsights(sinceDate, untilDate);

  // Build metaCampaignId → dbId map
  const allCampaigns = await prisma.metaCampaign.findMany({
    select: { id: true, metaCampaignId: true },
  });
  const campaignIdMap = new Map(allCampaigns.map((c) => [c.metaCampaignId, c.id]));

  const campaignDailyRows: Array<{
    campaignId: number;
    date: Date;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    purchases: number;
    purchaseValue: number;
    syncedAt: Date;
  }> = [];

  for (const ins of campaignInsights) {
    const campaignId = campaignIdMap.get(ins.campaign_id);
    if (!campaignId) continue;
    const date = new Date(`${ins.date_start}T00:00:00Z`);
    campaignDailyRows.push({
      campaignId,
      date,
      spend: parseFloat(ins.spend || "0"),
      impressions: parseInt(ins.impressions || "0", 10),
      reach: parseInt(ins.reach || "0", 10),
      clicks: parseInt(ins.clicks || "0", 10),
      ctr: parseFloat(ins.ctr || "0"),
      cpc: parseFloat(ins.cpc || "0"),
      cpm: parseFloat(ins.cpm || "0"),
      purchases: Math.round(pickPurchaseValue(ins.actions)),
      purchaseValue: pickPurchaseValue(ins.action_values),
      syncedAt: now,
    });
  }

  // Replace strategy: delete window rows we're about to write, then bulk-insert.
  if (campaignDailyRows.length > 0) {
    const dates = Array.from(new Set(campaignDailyRows.map((r) => r.date.toISOString()))).map(
      (s) => new Date(s)
    );
    await prisma.metaAdSpendDaily.deleteMany({ where: { date: { in: dates } } });
    for (let i = 0; i < campaignDailyRows.length; i += 1000) {
      await prisma.metaAdSpendDaily.createMany({
        data: campaignDailyRows.slice(i, i + 1000),
        skipDuplicates: true,
      });
    }
  }

  // ─── 3. Ad sets metadata ─────────────────────────────────────────
  const adSets = await fetchAllAdSets();
  const adSetBuilt = adSets.map((a) => ({
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

  const existingAdSets = await prisma.metaAdSet.findMany({
    select: { metaAdSetId: true, updatedTime: true },
  });
  const existingAdSetMap = new Map(
    existingAdSets.map((a) => [a.metaAdSetId, a.updatedTime.getTime()])
  );
  const newAdSets = adSetBuilt.filter((a) => !existingAdSetMap.has(a.metaAdSetId));
  const updateAdSets = adSetBuilt.filter((a) => {
    const dbTime = existingAdSetMap.get(a.metaAdSetId);
    return dbTime !== undefined && dbTime !== a.updatedTime.getTime();
  });

  if (newAdSets.length > 0) {
    for (let i = 0; i < newAdSets.length; i += 500) {
      await prisma.metaAdSet.createMany({
        data: newAdSets.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }
  await chunkedAll(updateAdSets, 25, (a) =>
    prisma.metaAdSet.update({ where: { metaAdSetId: a.metaAdSetId }, data: a })
  );

  // ─── 4. Ad set daily insights ────────────────────────────────────
  const adSetInsights = await fetchAdSetDailyInsights(sinceDate, untilDate);

  const allAdSets = await prisma.metaAdSet.findMany({
    select: { id: true, metaAdSetId: true },
  });
  const adSetIdMap = new Map(allAdSets.map((a) => [a.metaAdSetId, a.id]));

  const adSetDailyRows: Array<{
    adSetId: number;
    date: Date;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    purchases: number;
    purchaseValue: number;
    syncedAt: Date;
  }> = [];

  for (const ins of adSetInsights) {
    const adSetId = adSetIdMap.get(ins.adset_id);
    if (!adSetId) continue;
    const date = new Date(`${ins.date_start}T00:00:00Z`);
    adSetDailyRows.push({
      adSetId,
      date,
      spend: parseFloat(ins.spend || "0"),
      impressions: parseInt(ins.impressions || "0", 10),
      reach: parseInt(ins.reach || "0", 10),
      clicks: parseInt(ins.clicks || "0", 10),
      ctr: parseFloat(ins.ctr || "0"),
      cpc: parseFloat(ins.cpc || "0"),
      cpm: parseFloat(ins.cpm || "0"),
      frequency: parseFloat(ins.frequency || "0"),
      purchases: Math.round(pickPurchaseValue(ins.actions)),
      purchaseValue: pickPurchaseValue(ins.action_values),
      syncedAt: now,
    });
  }

  if (adSetDailyRows.length > 0) {
    const dates = Array.from(new Set(adSetDailyRows.map((r) => r.date.toISOString()))).map(
      (s) => new Date(s)
    );
    await prisma.metaAdSetDaily.deleteMany({ where: { date: { in: dates } } });
    for (let i = 0; i < adSetDailyRows.length; i += 1000) {
      await prisma.metaAdSetDaily.createMany({
        data: adSetDailyRows.slice(i, i + 1000),
        skipDuplicates: true,
      });
    }
  }

  // ─── 5. Ads metadata ─────────────────────────────────────────────
  const ads = await fetchAllAds();

  const adsBuilt: Array<{
    metaAdId: string;
    adSetId: number;
    name: string;
    status: string;
    effectiveStatus: string | null;
    creativeId: string | null;
    creativeName: string | null;
    creativeType: string | null;
    thumbnailUrl: string | null;
    previewLink: string | null;
    createdTime: Date;
    updatedTime: Date;
    syncedAt: Date;
  }> = [];
  let orphans = 0;

  for (const a of ads) {
    const adSetDbId = adSetIdMap.get(a.adset_id);
    if (!adSetDbId) {
      orphans++;
      continue;
    }
    let creativeType: string | null = null;
    if (a.creative?.video_id) creativeType = "video";
    else if (a.creative?.object_type) creativeType = a.creative.object_type.toLowerCase();
    else if (a.creative?.image_url || a.creative?.thumbnail_url) creativeType = "image";

    adsBuilt.push({
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
    });
  }

  const existingAds = await prisma.metaAd.findMany({
    select: { metaAdId: true, updatedTime: true },
  });
  const existingAdMap = new Map(
    existingAds.map((a) => [a.metaAdId, a.updatedTime.getTime()])
  );
  const newAds = adsBuilt.filter((a) => !existingAdMap.has(a.metaAdId));
  const updateAds = adsBuilt.filter((a) => {
    const dbTime = existingAdMap.get(a.metaAdId);
    return dbTime !== undefined && dbTime !== a.updatedTime.getTime();
  });

  if (newAds.length > 0) {
    for (let i = 0; i < newAds.length; i += 500) {
      await prisma.metaAd.createMany({
        data: newAds.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }
  // Higher concurrency for ads since there are many of them.
  await chunkedAll(updateAds, 50, (a) =>
    prisma.metaAd.update({ where: { metaAdId: a.metaAdId }, data: a })
  );

  // ─── 6. Ad daily insights ────────────────────────────────────────
  const adInsights = await fetchAdDailyInsights(sinceDate, untilDate);

  const allAdsRows = await prisma.metaAd.findMany({
    select: { id: true, metaAdId: true },
  });
  const adIdMap = new Map(allAdsRows.map((a) => [a.metaAdId, a.id]));

  const adDailyRows: Array<{
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

  for (const ins of adInsights) {
    const adId = adIdMap.get(ins.ad_id);
    if (!adId) continue;
    const date = new Date(`${ins.date_start}T00:00:00Z`);
    // Meta v22 removed video_3_sec_watched_actions — derive from actions[video_view].
    const video3s = pickPurchaseValue(ins.actions, ["video_view"]);
    const videoP75 = pickPurchaseValue(ins.video_p75_watched_actions, ["video_view"]);

    adDailyRows.push({
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
      video3sViews: Math.round(video3s),
      videoP75Views: Math.round(videoP75),
      purchases: Math.round(pickPurchaseValue(ins.actions)),
      purchaseValue: pickPurchaseValue(ins.action_values),
      qualityRanking: ins.quality_ranking ?? null,
      engagementRateRanking: ins.engagement_rate_ranking ?? null,
      conversionRateRanking: ins.conversion_rate_ranking ?? null,
      syncedAt: now,
    });
  }

  if (adDailyRows.length > 0) {
    const dates = Array.from(new Set(adDailyRows.map((r) => r.date.toISOString()))).map(
      (s) => new Date(s)
    );
    await prisma.metaAdDaily.deleteMany({ where: { date: { in: dates } } });
    for (let i = 0; i < adDailyRows.length; i += 1000) {
      await prisma.metaAdDaily.createMany({
        data: adDailyRows.slice(i, i + 1000),
        skipDuplicates: true,
      });
    }
  }

  return {
    success: true,
    daysBack,
    sinceDate: sinceDate.toISOString(),
    untilDate: untilDate.toISOString(),
    campaigns: { total: campaigns.length, added: newCampaigns.length, updated: updateCampaigns.length, dailyRows: campaignDailyRows.length },
    adSets: { total: adSets.length, added: newAdSets.length, updated: updateAdSets.length, dailyRows: adSetDailyRows.length },
    ads: { total: ads.length, added: newAds.length, updated: updateAds.length, dailyRows: adDailyRows.length, orphans },
    elapsedMs: Date.now() - t0,
  };
}

// GET handler — accepts auth via ?token= query OR Authorization Bearer header.
// ?wait=true blocks until done (manual debugging); default is async via after().
// ?days=N controls lookback window (default 30, capped at 90).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get("token");
  const headerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/, "");
  const token = queryToken ?? headerToken;
  const wait = searchParams.get("wait") === "true";
  const daysBack = Math.max(1, Math.min(parseInt(searchParams.get("days") ?? "30", 10), 90));
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (wait) {
    try {
      const result = await syncMeta(daysBack);
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Async path for cron — return 200 instantly, run in background.
  after(async () => {
    try {
      await syncMeta(daysBack);
    } catch (err) {
      console.error("[meta/sync] Background sync failed:", err);
    }
  });

  return NextResponse.json({
    accepted: true,
    message: `Meta sync started (last ${daysBack} days). Background processing.`,
  });
}
