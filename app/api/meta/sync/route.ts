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

// Up to 60s on Vercel Hobby (matches the Shopify sync pattern)
export const maxDuration = 60;

interface MetaActionEntry {
  action_type: string;
  value: string;
}

// Pull the value for a "purchase" action from Meta's actions array.
// Meta has many overlapping types — pick the most inclusive in priority order.
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

async function syncMeta(daysBack: number = 30) {
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const untilDate = new Date();

  // ─── 1. Pull campaigns ───────────────────────────────────────────
  const campaigns = await fetchAllCampaigns();
  let campaignsAdded = 0;
  let campaignsUpdated = 0;

  for (const c of campaigns) {
    const data = {
      metaCampaignId: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective ?? null,
      // Meta budgets are in the smallest currency unit (paise for INR).
      // Convert to rupees for display.
      dailyBudget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
      lifetimeBudget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
      startTime: c.start_time ? new Date(c.start_time) : null,
      stopTime: c.stop_time ? new Date(c.stop_time) : null,
      createdTime: new Date(c.created_time),
      updatedTime: new Date(c.updated_time),
      syncedAt: new Date(),
    };

    const existing = await prisma.metaCampaign.findUnique({
      where: { metaCampaignId: c.id },
    });
    if (existing) {
      await prisma.metaCampaign.update({
        where: { metaCampaignId: c.id },
        data,
      });
      campaignsUpdated++;
    } else {
      await prisma.metaCampaign.create({ data });
      campaignsAdded++;
    }
  }

  // ─── 2. Pull daily insights per campaign ─────────────────────────
  const insights = await fetchDailyInsights(sinceDate, untilDate);
  let spendRowsWritten = 0;

  for (const ins of insights) {
    const campaign = await prisma.metaCampaign.findUnique({
      where: { metaCampaignId: ins.campaign_id },
    });
    if (!campaign) continue;

    // Insight date_start is YYYY-MM-DD — store as midnight UTC of that date
    // (consistent with how Shopify createdAt comes in).
    const date = new Date(`${ins.date_start}T00:00:00Z`);

    const row = {
      campaignId: campaign.id,
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
      syncedAt: new Date(),
    };

    await prisma.metaAdSpendDaily.upsert({
      where: { campaignId_date: { campaignId: campaign.id, date } },
      update: row,
      create: row,
    });
    spendRowsWritten++;
  }

  // ─── 3. Pull ad sets ─────────────────────────────────────────────
  const adSets = await fetchAllAdSets();
  let adSetsAdded = 0;
  let adSetsUpdated = 0;

  for (const a of adSets) {
    const data = {
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
      syncedAt: new Date(),
    };
    const existing = await prisma.metaAdSet.findUnique({ where: { metaAdSetId: a.id } });
    if (existing) {
      await prisma.metaAdSet.update({ where: { metaAdSetId: a.id }, data });
      adSetsUpdated++;
    } else {
      await prisma.metaAdSet.create({ data });
      adSetsAdded++;
    }
  }

  // ─── 4. Daily insights per ad set ────────────────────────────────
  const adSetInsights = await fetchAdSetDailyInsights(sinceDate, untilDate);
  let adSetSpendRows = 0;
  for (const ins of adSetInsights) {
    const adSet = await prisma.metaAdSet.findUnique({ where: { metaAdSetId: ins.adset_id } });
    if (!adSet) continue;
    const date = new Date(`${ins.date_start}T00:00:00Z`);
    const row = {
      adSetId: adSet.id,
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
      syncedAt: new Date(),
    };
    await prisma.metaAdSetDaily.upsert({
      where: { adSetId_date: { adSetId: adSet.id, date } },
      update: row,
      create: row,
    });
    adSetSpendRows++;
  }

  // ─── 5. Pull ads ─────────────────────────────────────────────────
  const ads = await fetchAllAds();
  let adsAdded = 0;
  let adsUpdated = 0;

  for (const a of ads) {
    const adSet = await prisma.metaAdSet.findUnique({ where: { metaAdSetId: a.adset_id } });
    if (!adSet) continue; // skip orphans

    // Detect creative type
    let creativeType: string | null = null;
    if (a.creative?.video_id) creativeType = "video";
    else if (a.creative?.object_type) creativeType = a.creative.object_type.toLowerCase();
    else if (a.creative?.image_url || a.creative?.thumbnail_url) creativeType = "image";

    const data = {
      metaAdId: a.id,
      adSetId: adSet.id,
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
      syncedAt: new Date(),
    };

    const existing = await prisma.metaAd.findUnique({ where: { metaAdId: a.id } });
    if (existing) {
      await prisma.metaAd.update({ where: { metaAdId: a.id }, data });
      adsUpdated++;
    } else {
      await prisma.metaAd.create({ data });
      adsAdded++;
    }
  }

  // ─── 6. Daily insights per ad ────────────────────────────────────
  const adInsights = await fetchAdDailyInsights(sinceDate, untilDate);
  let adSpendRows = 0;
  for (const ins of adInsights) {
    const ad = await prisma.metaAd.findUnique({ where: { metaAdId: ins.ad_id } });
    if (!ad) continue;
    const date = new Date(`${ins.date_start}T00:00:00Z`);

    // Meta v22 removed video_3_sec_watched_actions — derive from actions[video_view].
    const video3s = pickPurchaseValue(ins.actions, ["video_view"]);
    const videoP75 = pickPurchaseValue(ins.video_p75_watched_actions, ["video_view"]);

    const row = {
      adId: ad.id,
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
      syncedAt: new Date(),
    };
    await prisma.metaAdDaily.upsert({
      where: { adId_date: { adId: ad.id, date } },
      update: row,
      create: row,
    });
    adSpendRows++;
  }

  return {
    success: true,
    daysBack,
    sinceDate: sinceDate.toISOString(),
    untilDate: untilDate.toISOString(),
    campaigns: { total: campaigns.length, added: campaignsAdded, updated: campaignsUpdated },
    adSets: { total: adSets.length, added: adSetsAdded, updated: adSetsUpdated, spendRows: adSetSpendRows },
    ads: { total: ads.length, added: adsAdded, updated: adsUpdated, spendRows: adSpendRows },
    campaignSpendRows: spendRowsWritten,
  };
}

// GET handler — accepts auth via ?token= query OR Authorization Bearer header.
// ?wait=true blocks until done (manual debugging); default is async via after().
// ?days=N controls lookback window (default 30).
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

  // Async — keep cron-job.org happy with instant 200, work continues in background
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
