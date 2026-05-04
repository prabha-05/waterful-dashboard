import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  startOfIstDay,
  startOfIstMonth,
  addDays,
  addIstMonths,
  istDayOfWeek,
  formatIstYmd,
  formatIstShort,
  formatIstMonthYear,
} from "@/lib/timezone";

function buildBuckets(count: number, unit: string, endDay: Date) {
  const buckets: { label: string; from: Date; to: Date }[] = [];
  const today = startOfIstDay(endDay);
  for (let i = count - 1; i >= 0; i--) {
    let from: Date, to: Date, label: string;
    if (unit === "day") {
      from = addDays(today, -i);
      to = addDays(from, 1);
      label = formatIstShort(from);
    } else if (unit === "week") {
      const dayOfWeek = istDayOfWeek(today);
      const daysSinceMonday = (dayOfWeek + 6) % 7;
      const monday = addDays(today, -daysSinceMonday);
      from = addDays(monday, -i * 7);
      to = addDays(from, 7);
      label = `${formatIstShort(from)} – ${formatIstShort(addDays(to, -1))}`;
    } else {
      const ms = startOfIstMonth(today);
      from = addIstMonths(ms, -i);
      to = addIstMonths(from, 1);
      label = formatIstMonthYear(from);
    }
    buckets.push({ label, from, to });
  }
  return buckets;
}

export async function GET(req: NextRequest) {
  const count = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("count") || "7"), 1), 52);
  const unit = req.nextUrl.searchParams.get("unit") || "day";
  if (!["day", "week", "month"].includes(unit)) {
    return NextResponse.json({ error: "unit must be day, week, or month" }, { status: 400 });
  }
  const endParam = req.nextUrl.searchParams.get("end");
  const endDay = endParam ? new Date(endParam) : new Date();

  const buckets = buildBuckets(count, unit, endDay);
  const globalFrom = buckets[0].from;
  const globalTo = buckets[buckets.length - 1].to;

  // Pull ad-set spend rows in window with adSet relation
  const spendRows = await prisma.metaAdSetDaily.findMany({
    where: { date: { gte: globalFrom, lt: globalTo } },
    include: {
      adSet: {
        select: {
          name: true,
          status: true,
          metaCampaignId: true,
          optimizationGoal: true,
          dailyBudget: true,
        },
      },
    },
  });

  // Aggregate per ad set
  const map = new Map<
    number,
    {
      name: string;
      status: string;
      campaignName: string;
      optimizationGoal: string | null;
      dailyBudget: number | null;
      spend: number;
      impressions: number;
      reach: number;
      clicks: number;
      frequency: number;
      frequencyDays: number;
      purchases: number;
      purchaseValue: number;
    }
  >();

  // Get campaign name lookup
  const campaignIds = [...new Set(spendRows.map((r) => r.adSet.metaCampaignId))];
  const campaigns = await prisma.metaCampaign.findMany({
    where: { metaCampaignId: { in: campaignIds } },
    select: { metaCampaignId: true, name: true },
  });
  const campaignNameLookup = new Map(campaigns.map((c) => [c.metaCampaignId, c.name]));

  for (const r of spendRows) {
    const existing = map.get(r.adSetId);
    if (existing) {
      existing.spend += r.spend;
      existing.impressions += r.impressions;
      existing.reach += r.reach;
      existing.clicks += r.clicks;
      existing.frequency += r.frequency;
      existing.frequencyDays += 1;
      existing.purchases += r.purchases;
      existing.purchaseValue += r.purchaseValue;
    } else {
      map.set(r.adSetId, {
        name: r.adSet.name,
        status: r.adSet.status,
        campaignName: campaignNameLookup.get(r.adSet.metaCampaignId) ?? "—",
        optimizationGoal: r.adSet.optimizationGoal,
        dailyBudget: r.adSet.dailyBudget,
        spend: r.spend,
        impressions: r.impressions,
        reach: r.reach,
        clicks: r.clicks,
        frequency: r.frequency,
        frequencyDays: 1,
        purchases: r.purchases,
        purchaseValue: r.purchaseValue,
      });
    }
  }

  const adSets = Array.from(map.values())
    .map((a) => ({
      ...a,
      spend: Math.round(a.spend),
      purchaseValue: Math.round(a.purchaseValue),
      avgFrequency: a.frequencyDays > 0 ? a.frequency / a.frequencyDays : 0,
      ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
      cpc: a.clicks > 0 ? a.spend / a.clicks : 0,
      cpa: a.purchases > 0 ? a.spend / a.purchases : 0,
      roas: a.spend > 0 ? a.purchaseValue / a.spend : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  // Totals
  const totals = adSets.reduce(
    (acc, a) => ({
      spend: acc.spend + a.spend,
      impressions: acc.impressions + a.impressions,
      clicks: acc.clicks + a.clicks,
      purchases: acc.purchases + a.purchases,
      purchaseValue: acc.purchaseValue + a.purchaseValue,
    }),
    { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0 }
  );

  const lastRow = await prisma.metaAdSetDaily.findFirst({
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  const totalAdSets = await prisma.metaAdSet.count();
  const activeAdSets = await prisma.metaAdSet.count({ where: { status: "ACTIVE" } });

  return NextResponse.json({
    count,
    unit,
    window: { from: formatIstYmd(globalFrom), to: formatIstYmd(globalTo) },
    totals: {
      ...totals,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cpa: totals.purchases > 0 ? totals.spend / totals.purchases : 0,
      roas: totals.spend > 0 ? totals.purchaseValue / totals.spend : 0,
    },
    adSets,
    meta: {
      lastSyncedAt: lastRow?.syncedAt ?? null,
      totalAdSets,
      activeAdSets,
    },
  });
}
