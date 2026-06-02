import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startOfIstDay, addDays, formatIstYmd, formatIstShort } from "@/lib/timezone";

// Trends → Ads. Daily aggregate per ad with previous-window comparison +
// daily series for sparklines. Scoped to a specific ad set (param required)
// because the page only shows ads within one ad set at a time.

type DailyPoint = { date: string; label: string; value: number };

type AdTrend = {
  metaAdId: string;
  name: string;
  status: string;
  creativeType: string | null;
  thumbnailUrl: string | null;
  previewLink: string | null;
  adSetName: string;
  campaignName: string;
  // Parent budgets — used by the Spend card's reference line. ad-set budget
  // is the primary; campaign budget is the fallback for CBO setups.
  adSetDailyBudget: number | null;
  campaignDailyBudget: number | null;
  current: {
    spend: number;
    impressions: number;
    clicks: number;
    purchases: number;
    purchaseValue: number;
    addToCart: number;
    initiateCheckout: number;
    landingPageViews: number;
    video3sViews: number;
    video25pViews: number;
    video50pViews: number;
    videoP75Views: number;
    video100pViews: number;
    frequency: number;
    cpm: number;
    cpc: number;
    ctr: number;
    cpp: number;
    roas: number;
    hookRate: number;
    holdRate: number;
  };
  previous: AdTrend["current"] | null;
  series: {
    spend: DailyPoint[];
    roas: DailyPoint[];
    cpp: DailyPoint[];
    purchases: DailyPoint[];
    purchaseValue: DailyPoint[];
    ctr: DailyPoint[];
    cpm: DailyPoint[];
    cpc: DailyPoint[];
    frequency: DailyPoint[];
  };
};

export async function GET(req: NextRequest) {
  const days = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("days") || "3"), 1),
    30
  );

  const todayStart = startOfIstDay(new Date());
  const currentEnd = todayStart;
  const currentStart = addDays(currentEnd, -days);
  const priorEnd = currentStart;
  const priorStart = addDays(priorEnd, -days);

  // Day buckets for sparklines (current window only)
  const dayBuckets: { ymd: string; label: string }[] = [];
  for (let i = 0; i < days; i++) {
    const from = addDays(currentStart, i);
    dayBuckets.push({ ymd: formatIstYmd(from), label: formatIstShort(from) });
  }

  // Pull ad-level daily rows for both windows (covers all ads — frontend
  // filters by selected ad set).
  const rows = await prisma.metaAdDaily.findMany({
    where: { date: { gte: priorStart, lt: currentEnd } },
    include: {
      ad: {
        select: {
          metaAdId: true,
          name: true,
          status: true,
          creativeType: true,
          thumbnailUrl: true,
          previewLink: true,
          adSet: {
            select: {
              metaAdSetId: true,
              name: true,
              metaCampaignId: true,
              dailyBudget: true,
            },
          },
        },
      },
    },
  });

  // Look up campaign names + daily budgets (campaign budget is the CBO fallback
  // when the parent ad-set has no budget of its own).
  const campaignIds = Array.from(new Set(rows.map((r) => r.ad.adSet.metaCampaignId)));
  const campaigns = await prisma.metaCampaign.findMany({
    where: { metaCampaignId: { in: campaignIds } },
    select: { metaCampaignId: true, name: true, dailyBudget: true },
  });
  const campaignName = new Map(campaigns.map((c) => [c.metaCampaignId, c.name]));
  const campaignDailyBudget = new Map(campaigns.map((c) => [c.metaCampaignId, c.dailyBudget]));

  // Per-ad accumulators
  type AdAcc = {
    metaAdId: string;
    name: string;
    status: string;
    creativeType: string | null;
    thumbnailUrl: string | null;
    previewLink: string | null;
    adSetName: string;
    metaAdSetId: string;
    metaCampaignId: string;
    adSetDailyBudget: number | null;
    cur: { spend: number; impressions: number; clicks: number; purchases: number; purchaseValue: number; addToCart: number; initiateCheckout: number; landingPageViews: number; video3sViews: number; video25pViews: number; video50pViews: number; videoP75Views: number; video100pViews: number; freqNum: number };
    prev: AdAcc["cur"];
    // Per-day buckets for the current window only — used to build sparklines
    daily: Map<string, { spend: number; impressions: number; clicks: number; purchases: number; purchaseValue: number; freqNum: number }>;
  };
  const blank = () => ({ spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0, addToCart: 0, initiateCheckout: 0, landingPageViews: 0, video3sViews: 0, video25pViews: 0, video50pViews: 0, videoP75Views: 0, video100pViews: 0, freqNum: 0 });
  const blankDaily = () => ({ spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0, freqNum: 0 });

  const ads = new Map<string, AdAcc>();
  for (const r of rows) {
    const id = r.ad.metaAdId;
    if (!ads.has(id)) {
      ads.set(id, {
        metaAdId: id,
        name: r.ad.name,
        status: r.ad.status,
        creativeType: r.ad.creativeType,
        thumbnailUrl: r.ad.thumbnailUrl,
        previewLink: r.ad.previewLink,
        adSetName: r.ad.adSet.name,
        metaAdSetId: r.ad.adSet.metaAdSetId,
        metaCampaignId: r.ad.adSet.metaCampaignId,
        adSetDailyBudget: r.ad.adSet.dailyBudget,
        cur: blank(),
        prev: blank(),
        daily: new Map(),
      });
    }
    const a = ads.get(id)!;
    const inCurrent = r.date >= currentStart && r.date < currentEnd;
    const bucket = inCurrent ? a.cur : a.prev;
    bucket.spend += r.spend;
    bucket.impressions += r.impressions;
    bucket.clicks += r.clicks;
    bucket.purchases += r.purchases;
    bucket.purchaseValue += r.purchaseValue;
    bucket.addToCart += r.addToCart;
    bucket.initiateCheckout += r.initiateCheckout;
    bucket.landingPageViews += r.landingPageViews;
    bucket.video3sViews += r.video3sViews;
    bucket.video25pViews += r.video25pViews;
    bucket.video50pViews += r.video50pViews;
    bucket.videoP75Views += r.videoP75Views;
    bucket.video100pViews += r.video100pViews;
    // Weighted-average frequency: sum(freq × impressions) / sum(impressions)
    bucket.freqNum += r.frequency * r.impressions;

    // Per-day accumulator for sparklines — only for current window
    if (inCurrent) {
      const ymd = formatIstYmd(r.date);
      const d = a.daily.get(ymd) ?? blankDaily();
      d.spend += r.spend;
      d.impressions += r.impressions;
      d.clicks += r.clicks;
      d.purchases += r.purchases;
      d.purchaseValue += r.purchaseValue;
      d.freqNum += r.frequency * r.impressions;
      a.daily.set(ymd, d);
    }
  }

  const derive = (b: AdAcc["cur"]) => ({
    spend: Math.round(b.spend),
    impressions: b.impressions,
    clicks: b.clicks,
    purchases: b.purchases,
    purchaseValue: Math.round(b.purchaseValue),
    addToCart: b.addToCart,
    initiateCheckout: b.initiateCheckout,
    landingPageViews: b.landingPageViews,
    video3sViews: b.video3sViews,
    video25pViews: b.video25pViews,
    video50pViews: b.video50pViews,
    videoP75Views: b.videoP75Views,
    video100pViews: b.video100pViews,
    frequency: b.impressions > 0 ? b.freqNum / b.impressions : 0,
    cpm: b.impressions > 0 ? (b.spend / b.impressions) * 1000 : 0,
    cpc: b.clicks > 0 ? b.spend / b.clicks : 0,
    ctr: b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0,
    cpp: b.purchases > 0 ? b.spend / b.purchases : 0,
    roas: b.spend > 0 ? b.purchaseValue / b.spend : 0,
    hookRate: b.impressions > 0 ? (b.video3sViews / b.impressions) * 100 : 0,
    holdRate: b.video3sViews > 0 ? (b.videoP75Views / b.video3sViews) * 100 : 0,
  });

  const buildSeries = (a: AdAcc) => {
    const seriesFor = (k: "spend" | "purchases" | "purchaseValue" | "impressions" | "clicks"): DailyPoint[] =>
      dayBuckets.map((b) => ({ date: b.ymd, label: b.label, value: a.daily.get(b.ymd)?.[k] ?? 0 }));
    return {
      spend: seriesFor("spend"),
      purchases: seriesFor("purchases"),
      purchaseValue: seriesFor("purchaseValue"),
      roas: dayBuckets.map((b) => {
        const d = a.daily.get(b.ymd);
        return { date: b.ymd, label: b.label, value: d && d.spend > 0 ? d.purchaseValue / d.spend : 0 };
      }),
      cpp: dayBuckets.map((b) => {
        const d = a.daily.get(b.ymd);
        return { date: b.ymd, label: b.label, value: d && d.purchases > 0 ? d.spend / d.purchases : 0 };
      }),
      ctr: dayBuckets.map((b) => {
        const d = a.daily.get(b.ymd);
        return { date: b.ymd, label: b.label, value: d && d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0 };
      }),
      cpm: dayBuckets.map((b) => {
        const d = a.daily.get(b.ymd);
        return { date: b.ymd, label: b.label, value: d && d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0 };
      }),
      cpc: dayBuckets.map((b) => {
        const d = a.daily.get(b.ymd);
        return { date: b.ymd, label: b.label, value: d && d.clicks > 0 ? d.spend / d.clicks : 0 };
      }),
      frequency: dayBuckets.map((b) => {
        const d = a.daily.get(b.ymd);
        return { date: b.ymd, label: b.label, value: d && d.impressions > 0 ? d.freqNum / d.impressions : 0 };
      }),
    };
  };

  const adTrends: (AdTrend & { metaAdSetId: string; metaCampaignId: string })[] = Array.from(ads.values()).map((a) => ({
    metaAdId: a.metaAdId,
    name: a.name,
    status: a.status,
    creativeType: a.creativeType,
    thumbnailUrl: a.thumbnailUrl,
    previewLink: a.previewLink,
    adSetName: a.adSetName,
    campaignName: campaignName.get(a.metaCampaignId) ?? "(unknown campaign)",
    adSetDailyBudget: a.adSetDailyBudget,
    campaignDailyBudget: campaignDailyBudget.get(a.metaCampaignId) ?? null,
    metaAdSetId: a.metaAdSetId,
    metaCampaignId: a.metaCampaignId,
    current: derive(a.cur),
    previous: a.prev.spend === 0 && a.prev.impressions === 0 ? null : derive(a.prev),
    series: buildSeries(a),
  }));

  adTrends.sort((a, b) => b.current.spend - a.current.spend);

  return NextResponse.json({
    days,
    window: { from: formatIstYmd(currentStart), to: formatIstYmd(addDays(currentEnd, -1)) },
    priorWindow: { from: formatIstYmd(priorStart), to: formatIstYmd(addDays(priorEnd, -1)) },
    ads: adTrends,
  });
}
