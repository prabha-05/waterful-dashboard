import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startOfIstDay, addDays, formatIstYmd, formatIstShort } from "@/lib/timezone";

// Daily aggregate per ad set for current + prior windows. Powers the
// Trends → Ad Sets page (rolling-window comparison with sparklines).

type DailyPoint = { date: string; label: string; value: number };

type AdSetTrend = {
  metaAdSetId: string;
  name: string;
  status: string;
  metaCampaignId: string;
  campaignName: string;
  dailyBudget: number | null;
  // Parent campaign's daily budget — used as the budget fallback when the
  // ad-set has none of its own (typical for CBO campaigns).
  campaignDailyBudget: number | null;
  adsCount: number;
  // Inherited from campaign (same tag scheme as Campaigns page)
  tags: { buyingType: "CBO" | "ABO" | null; advantagePlus: boolean; kind: "Scaling" | "Testing" | null };
  current: {
    spend: number;
    purchases: number;
    purchaseValue: number;
    impressions: number;
    clicks: number;
    reach: number;
    roas: number;
    cpp: number;
    ctr: number;
    frequency: number;
  };
  previous: AdSetTrend["current"] | null;
  series: {
    spend: DailyPoint[];
    roas: DailyPoint[];
    cpp: DailyPoint[];
    purchases: DailyPoint[];
    ctr: DailyPoint[];
    frequency: DailyPoint[];
  };
};

export async function GET(req: NextRequest) {
  const days = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("days") || "3"), 1),
    30
  );

  const todayStart = startOfIstDay(new Date());
  const currentEnd = todayStart; // exclusive
  const currentStart = addDays(currentEnd, -days);
  const priorEnd = currentStart;
  const priorStart = addDays(priorEnd, -days);

  // Pull ad-set-level daily for both windows
  const rows = await prisma.metaAdSetDaily.findMany({
    where: { date: { gte: priorStart, lt: currentEnd } },
    include: {
      adSet: {
        select: {
          metaAdSetId: true,
          name: true,
          status: true,
          metaCampaignId: true,
          dailyBudget: true,
        },
      },
    },
  });

  // Resolve campaign metadata for tags + breadcrumb display
  const campaignIds = Array.from(new Set(rows.map((r) => r.adSet.metaCampaignId)));
  const campaigns = await prisma.metaCampaign.findMany({
    where: { metaCampaignId: { in: campaignIds } },
    select: { metaCampaignId: true, name: true, objective: true, dailyBudget: true },
  });
  const campaignMap = new Map(campaigns.map((c) => [c.metaCampaignId, c]));

  // Count ads per ad set (live count, not just spending in window)
  const allAds = await prisma.metaAd.findMany({ select: { adSet: { select: { metaAdSetId: true } } } });
  const adsCountByAdSet = new Map<string, number>();
  for (const a of allAds) {
    const id = a.adSet.metaAdSetId;
    adsCountByAdSet.set(id, (adsCountByAdSet.get(id) ?? 0) + 1);
  }

  // Day buckets for sparklines (current window only)
  const dayBuckets: { from: Date; to: Date; ymd: string; label: string }[] = [];
  for (let i = 0; i < days; i++) {
    const from = addDays(currentStart, i);
    const to = addDays(from, 1);
    dayBuckets.push({ from, to, ymd: formatIstYmd(from), label: formatIstShort(from) });
  }

  type Acc = {
    metaAdSetId: string;
    name: string;
    status: string;
    metaCampaignId: string;
    dailyBudget: number | null;
    cur: { spend: number; purchases: number; purchaseValue: number; impressions: number; clicks: number; reach: number; freqNum: number; freqDen: number };
    prev: { spend: number; purchases: number; purchaseValue: number; impressions: number; clicks: number; reach: number; freqNum: number; freqDen: number };
    daily: Map<string, { spend: number; purchases: number; purchaseValue: number; impressions: number; clicks: number; freqNum: number; freqDen: number }>;
  };
  const sets = new Map<string, Acc>();
  const blank = () => ({ spend: 0, purchases: 0, purchaseValue: 0, impressions: 0, clicks: 0, reach: 0, freqNum: 0, freqDen: 0 });
  const blankDaily = () => ({ spend: 0, purchases: 0, purchaseValue: 0, impressions: 0, clicks: 0, freqNum: 0, freqDen: 0 });

  for (const r of rows) {
    const id = r.adSet.metaAdSetId;
    if (!sets.has(id)) {
      sets.set(id, {
        metaAdSetId: id,
        name: r.adSet.name,
        status: r.adSet.status,
        metaCampaignId: r.adSet.metaCampaignId,
        dailyBudget: r.adSet.dailyBudget,
        cur: blank(),
        prev: blank(),
        daily: new Map(),
      });
    }
    const a = sets.get(id)!;
    const inCurrent = r.date >= currentStart && r.date < currentEnd;
    const bucket = inCurrent ? a.cur : a.prev;
    bucket.spend += r.spend;
    bucket.purchases += r.purchases;
    bucket.purchaseValue += r.purchaseValue;
    bucket.impressions += r.impressions;
    bucket.clicks += r.clicks;
    bucket.reach += r.reach;
    bucket.freqNum += r.frequency * r.impressions;
    bucket.freqDen += r.impressions;

    if (inCurrent) {
      const ymd = formatIstYmd(r.date);
      const d = a.daily.get(ymd) ?? blankDaily();
      d.spend += r.spend;
      d.purchases += r.purchases;
      d.purchaseValue += r.purchaseValue;
      d.impressions += r.impressions;
      d.clicks += r.clicks;
      d.freqNum += r.frequency * r.impressions;
      d.freqDen += r.impressions;
      a.daily.set(ymd, d);
    }
  }

  const adSets: AdSetTrend[] = Array.from(sets.values()).map((a) => {
    const camp = campaignMap.get(a.metaCampaignId);
    const campName = camp?.name ?? "(unknown campaign)";
    const nameLower = campName.toLowerCase();
    const kind: "Scaling" | "Testing" | null = nameLower.includes("scaling")
      ? "Scaling"
      : nameLower.includes("testing") || nameLower.includes("broad")
      ? "Testing"
      : null;
    const buyingType: "CBO" | "ABO" | null = camp?.dailyBudget && camp.dailyBudget > 0 ? "CBO" : "ABO";
    const advantagePlus =
      camp?.objective?.toLowerCase().includes("advantage") ||
      nameLower.includes("adv+") ||
      nameLower.includes("adv ");

    const curRoas = a.cur.spend > 0 ? a.cur.purchaseValue / a.cur.spend : 0;
    const prevRoas = a.prev.spend > 0 ? a.prev.purchaseValue / a.prev.spend : 0;
    const curCpp = a.cur.purchases > 0 ? a.cur.spend / a.cur.purchases : 0;
    const prevCpp = a.prev.purchases > 0 ? a.prev.spend / a.prev.purchases : 0;
    const curCtr = a.cur.impressions > 0 ? (a.cur.clicks / a.cur.impressions) * 100 : 0;
    const prevCtr = a.prev.impressions > 0 ? (a.prev.clicks / a.prev.impressions) * 100 : 0;
    const curFreq = a.cur.freqDen > 0 ? a.cur.freqNum / a.cur.freqDen : 0;
    const prevFreq = a.prev.freqDen > 0 ? a.prev.freqNum / a.prev.freqDen : 0;

    const seriesFor = (k: "spend" | "purchases" | "purchaseValue" | "impressions" | "clicks"): DailyPoint[] =>
      dayBuckets.map((b) => ({ date: b.ymd, label: b.label, value: a.daily.get(b.ymd)?.[k] ?? 0 }));

    const series = {
      spend: seriesFor("spend"),
      purchases: seriesFor("purchases"),
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
      frequency: dayBuckets.map((b) => {
        const d = a.daily.get(b.ymd);
        return { date: b.ymd, label: b.label, value: d && d.freqDen > 0 ? d.freqNum / d.freqDen : 0 };
      }),
    };

    return {
      metaAdSetId: a.metaAdSetId,
      name: a.name,
      status: a.status,
      metaCampaignId: a.metaCampaignId,
      campaignName: campName,
      dailyBudget: a.dailyBudget,
      campaignDailyBudget: camp?.dailyBudget ?? null,
      adsCount: adsCountByAdSet.get(a.metaAdSetId) ?? 0,
      tags: { buyingType, advantagePlus: Boolean(advantagePlus), kind },
      current: {
        spend: Math.round(a.cur.spend),
        purchases: a.cur.purchases,
        purchaseValue: Math.round(a.cur.purchaseValue),
        impressions: a.cur.impressions,
        clicks: a.cur.clicks,
        reach: a.cur.reach,
        roas: curRoas,
        cpp: curCpp,
        ctr: curCtr,
        frequency: curFreq,
      },
      previous:
        a.prev.spend === 0 && a.prev.purchases === 0
          ? null
          : {
              spend: Math.round(a.prev.spend),
              purchases: a.prev.purchases,
              purchaseValue: Math.round(a.prev.purchaseValue),
              impressions: a.prev.impressions,
              clicks: a.prev.clicks,
              reach: a.prev.reach,
              roas: prevRoas,
              cpp: prevCpp,
              ctr: prevCtr,
              frequency: prevFreq,
            },
      series,
    };
  });

  // Sort by current spend descending
  adSets.sort((a, b) => b.current.spend - a.current.spend);

  // Alerts at the selected ad-set level — computed client-side because they
  // depend on the selected ad set. API returns campaign+adSet structure only.

  return NextResponse.json({
    days,
    window: { from: formatIstYmd(currentStart), to: formatIstYmd(addDays(currentEnd, -1)) },
    priorWindow: { from: formatIstYmd(priorStart), to: formatIstYmd(addDays(priorEnd, -1)) },
    adSets,
  });
}
