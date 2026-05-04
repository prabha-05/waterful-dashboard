import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startOfIstDay, addDays, formatIstYmd } from "@/lib/timezone";

function parseYmdToIstDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  // IST midnight for that calendar day, expressed as a UTC instant
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);
}

export async function GET(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");

  // Default window: last 7 days ending yesterday (IST)
  const todayIst = startOfIstDay(new Date());
  const defaultTo = addDays(todayIst, -1); // yesterday
  const defaultFrom = addDays(defaultTo, -6); // 7-day window

  const from = fromParam ? parseYmdToIstDay(fromParam) : defaultFrom;
  const to = toParam ? parseYmdToIstDay(toParam) : defaultTo;
  if (!from || !to) {
    return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from must be <= to" }, { status: 400 });
  }
  // Inclusive of `to` day
  const toExclusive = addDays(to, 1);

  const spendRows = await prisma.metaAdDaily.findMany({
    where: { date: { gte: from, lt: toExclusive } },
    include: {
      ad: {
        select: {
          name: true,
          status: true,
          creativeType: true,
          thumbnailUrl: true,
          previewLink: true,
          createdTime: true,
          adSet: {
            select: {
              name: true,
              metaCampaignId: true,
            },
          },
        },
      },
    },
  });

  // Resolve campaign names
  const campaignIds = [...new Set(spendRows.map((r) => r.ad.adSet.metaCampaignId))];
  const campaigns = await prisma.metaCampaign.findMany({
    where: { metaCampaignId: { in: campaignIds } },
    select: { metaCampaignId: true, name: true },
  });
  const campaignNameLookup = new Map(campaigns.map((c) => [c.metaCampaignId, c.name]));

  type DailyPoint = {
    date: string;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    purchases: number;
    purchaseValue: number;
    frequency: number;
    hookRate: number;
    holdRate: number;
  };

  type AdAgg = {
    adId: number;
    name: string;
    status: string;
    adSetName: string;
    campaignName: string;
    creativeType: string | null;
    thumbnailUrl: string | null;
    previewLink: string | null;
    createdTime: Date;
    qualityRanking: string | null;
    engagementRateRanking: string | null;
    conversionRateRanking: string | null;
    daily: DailyPoint[];
  };

  const map = new Map<number, AdAgg>();

  for (const r of spendRows) {
    let agg = map.get(r.adId);
    if (!agg) {
      agg = {
        adId: r.adId,
        name: r.ad.name,
        status: r.ad.status,
        adSetName: r.ad.adSet.name,
        campaignName: campaignNameLookup.get(r.ad.adSet.metaCampaignId) ?? "—",
        creativeType: r.ad.creativeType,
        thumbnailUrl: r.ad.thumbnailUrl,
        previewLink: r.ad.previewLink,
        createdTime: r.ad.createdTime,
        qualityRanking: null,
        engagementRateRanking: null,
        conversionRateRanking: null,
        daily: [],
      };
      map.set(r.adId, agg);
    }
    agg.daily.push({
      date: formatIstYmd(r.date),
      spend: r.spend,
      impressions: r.impressions,
      reach: r.reach,
      clicks: r.clicks,
      purchases: r.purchases,
      purchaseValue: r.purchaseValue,
      frequency: r.frequency,
      hookRate: r.impressions > 0 ? (r.video3sViews / r.impressions) * 100 : 0,
      holdRate: r.video3sViews > 0 ? (r.videoP75Views / r.video3sViews) * 100 : 0,
    });
    if (r.qualityRanking) agg.qualityRanking = r.qualityRanking;
    if (r.engagementRateRanking) agg.engagementRateRanking = r.engagementRateRanking;
    if (r.conversionRateRanking) agg.conversionRateRanking = r.conversionRateRanking;
  }

  const now = Date.now();
  const ads = Array.from(map.values())
    .map((a) => {
      a.daily.sort((x, y) => x.date.localeCompare(y.date));
      const t = a.daily.reduce(
        (acc, d) => ({
          spend: acc.spend + d.spend,
          impressions: acc.impressions + d.impressions,
          reach: acc.reach + d.reach,
          clicks: acc.clicks + d.clicks,
          purchases: acc.purchases + d.purchases,
          purchaseValue: acc.purchaseValue + d.purchaseValue,
          frequencySum: acc.frequencySum + d.frequency,
          days: acc.days + 1,
        }),
        { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, purchaseValue: 0, frequencySum: 0, days: 0 }
      );
      return {
        adId: a.adId,
        name: a.name,
        status: a.status,
        adSetName: a.adSetName,
        campaignName: a.campaignName,
        creativeType: a.creativeType,
        thumbnailUrl: a.thumbnailUrl,
        previewLink: a.previewLink,
        qualityRanking: a.qualityRanking,
        engagementRateRanking: a.engagementRateRanking,
        conversionRateRanking: a.conversionRateRanking,
        daysRunning: Math.floor((now - a.createdTime.getTime()) / 86400000),
        spend: Math.round(t.spend),
        impressions: t.impressions,
        reach: t.reach,
        clicks: t.clicks,
        purchases: t.purchases,
        purchaseValue: Math.round(t.purchaseValue),
        avgFrequency: t.days > 0 ? t.frequencySum / t.days : 0,
        ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
        cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
        cpa: t.purchases > 0 ? t.spend / t.purchases : 0,
        roas: t.spend > 0 ? t.purchaseValue / t.spend : 0,
        daily: a.daily,
      };
    })
    .filter((a) => a.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  // Window totals
  const totals = ads.reduce(
    (acc, a) => ({
      spend: acc.spend + a.spend,
      impressions: acc.impressions + a.impressions,
      reach: acc.reach + a.reach,
      clicks: acc.clicks + a.clicks,
      purchases: acc.purchases + a.purchases,
      purchaseValue: acc.purchaseValue + a.purchaseValue,
      frequencySum: acc.frequencySum + a.avgFrequency,
      adsCount: acc.adsCount + 1,
    }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, purchaseValue: 0, frequencySum: 0, adsCount: 0 }
  );

  // Per-day spend across all ads
  const dailySpendMap = new Map<string, number>();
  for (const a of ads) {
    for (const d of a.daily) {
      dailySpendMap.set(d.date, (dailySpendMap.get(d.date) ?? 0) + d.spend);
    }
  }
  const totalDailySpend = Array.from(dailySpendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, spend]) => ({ date, spend: Math.round(spend) }));

  const lastRow = await prisma.metaAdDaily.findFirst({
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  const totalAds = await prisma.metaAd.count();
  const activeAds = await prisma.metaAd.count({ where: { status: "ACTIVE" } });

  return NextResponse.json({
    window: { from: formatIstYmd(from), to: formatIstYmd(to) },
    totals: {
      spend: totals.spend,
      impressions: totals.impressions,
      reach: totals.reach,
      clicks: totals.clicks,
      purchases: totals.purchases,
      purchaseValue: totals.purchaseValue,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cpa: totals.purchases > 0 ? totals.spend / totals.purchases : 0,
      roas: totals.spend > 0 ? totals.purchaseValue / totals.spend : 0,
      avgFrequency: totals.adsCount > 0 ? totals.frequencySum / totals.adsCount : 0,
      adsCount: totals.adsCount,
    },
    totalDailySpend,
    ads,
    meta: {
      lastSyncedAt: lastRow?.syncedAt ?? null,
      totalAds,
      activeAds,
    },
  });
}
