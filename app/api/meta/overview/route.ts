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

// Build IST-aligned period buckets matching the Trends page convention.
function buildBuckets(
  count: number,
  unit: string,
  endDay: Date
): { label: string; from: Date; to: Date }[] {
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
      const mondayOfCurrentWeek = addDays(today, -daysSinceMonday);
      from = addDays(mondayOfCurrentWeek, -i * 7);
      to = addDays(from, 7);
      const lastDay = addDays(to, -1);
      label = `${formatIstShort(from)} – ${formatIstShort(lastDay)}`;
    } else {
      const monthStart = startOfIstMonth(today);
      from = addIstMonths(monthStart, -i);
      to = addIstMonths(from, 1);
      label = formatIstMonthYear(from);
    }

    buckets.push({ label, from, to });
  }
  return buckets;
}

type Period = {
  label: string;
  from: string;
  to: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  purchaseValue: number;
};

export async function GET(req: NextRequest) {
  const count = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("count") || "7"), 1),
    52
  );
  const unit = req.nextUrl.searchParams.get("unit") || "day";

  if (!["day", "week", "month"].includes(unit)) {
    return NextResponse.json(
      { error: "unit must be day, week, or month" },
      { status: 400 }
    );
  }

  const endParam = req.nextUrl.searchParams.get("end");
  const endDay = endParam ? new Date(endParam) : new Date();

  const buckets = buildBuckets(count, unit, endDay);
  const globalFrom = buckets[0].from;
  const globalTo = buckets[buckets.length - 1].to;

  // Previous equivalent window (for deltas)
  const windowMs = globalTo.getTime() - globalFrom.getTime();
  const prevTo = new Date(globalFrom.getTime());
  const prevFrom = new Date(globalFrom.getTime() - windowMs);

  // Pull all spend rows for current + previous window
  const spendRows = await prisma.metaAdSpendDaily.findMany({
    where: { date: { gte: prevFrom, lt: globalTo } },
    include: { campaign: { select: { name: true, status: true } } },
  });

  // Build per-bucket totals
  const periods: Period[] = buckets.map((bucket) => {
    const inBucket = spendRows.filter(
      (r) => r.date >= bucket.from && r.date < bucket.to
    );
    return {
      label: bucket.label,
      from: formatIstYmd(bucket.from),
      to: formatIstYmd(bucket.to),
      spend: Math.round(inBucket.reduce((s, r) => s + r.spend, 0)),
      impressions: inBucket.reduce((s, r) => s + r.impressions, 0),
      reach: inBucket.reduce((s, r) => s + r.reach, 0),
      clicks: inBucket.reduce((s, r) => s + r.clicks, 0),
      purchases: inBucket.reduce((s, r) => s + r.purchases, 0),
      purchaseValue: Math.round(
        inBucket.reduce((s, r) => s + r.purchaseValue, 0)
      ),
    };
  });

  // Current totals
  const inWindow = spendRows.filter(
    (r) => r.date >= globalFrom && r.date < globalTo
  );
  const totals = {
    spend: Math.round(inWindow.reduce((s, r) => s + r.spend, 0)),
    impressions: inWindow.reduce((s, r) => s + r.impressions, 0),
    reach: inWindow.reduce((s, r) => s + r.reach, 0),
    clicks: inWindow.reduce((s, r) => s + r.clicks, 0),
    purchases: inWindow.reduce((s, r) => s + r.purchases, 0),
    purchaseValue: Math.round(
      inWindow.reduce((s, r) => s + r.purchaseValue, 0)
    ),
  };

  // Previous-window totals
  const prevInWindow = spendRows.filter(
    (r) => r.date >= prevFrom && r.date < prevTo
  );
  const previousTotals = {
    spend: Math.round(prevInWindow.reduce((s, r) => s + r.spend, 0)),
    impressions: prevInWindow.reduce((s, r) => s + r.impressions, 0),
    reach: prevInWindow.reduce((s, r) => s + r.reach, 0),
    clicks: prevInWindow.reduce((s, r) => s + r.clicks, 0),
    purchases: prevInWindow.reduce((s, r) => s + r.purchases, 0),
    purchaseValue: Math.round(
      prevInWindow.reduce((s, r) => s + r.purchaseValue, 0)
    ),
  };

  // Campaign-level breakdown for the current window
  const campaignMap = new Map<
    number,
    {
      name: string;
      status: string;
      spend: number;
      impressions: number;
      reach: number;
      clicks: number;
      purchases: number;
      purchaseValue: number;
    }
  >();

  for (const r of inWindow) {
    const existing = campaignMap.get(r.campaignId);
    if (existing) {
      existing.spend += r.spend;
      existing.impressions += r.impressions;
      existing.reach += r.reach;
      existing.clicks += r.clicks;
      existing.purchases += r.purchases;
      existing.purchaseValue += r.purchaseValue;
    } else {
      campaignMap.set(r.campaignId, {
        name: r.campaign.name,
        status: r.campaign.status,
        spend: r.spend,
        impressions: r.impressions,
        reach: r.reach,
        clicks: r.clicks,
        purchases: r.purchases,
        purchaseValue: r.purchaseValue,
      });
    }
  }

  const campaigns = Array.from(campaignMap.values())
    .map((c) => ({
      ...c,
      spend: Math.round(c.spend),
      purchaseValue: Math.round(c.purchaseValue),
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
      cpa: c.purchases > 0 ? c.spend / c.purchases : 0,
      roas: c.spend > 0 ? c.purchaseValue / c.spend : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  // Last sync timestamp
  const lastRow = await prisma.metaAdSpendDaily.findFirst({
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  const totalCampaigns = await prisma.metaCampaign.count();
  const activeCampaigns = await prisma.metaCampaign.count({
    where: { status: "ACTIVE" },
  });

  return NextResponse.json({
    count,
    unit,
    periods,
    totals,
    previousTotals,
    previousWindow: {
      from: formatIstYmd(prevFrom),
      to: formatIstYmd(prevTo),
    },
    campaigns,
    meta: {
      lastSyncedAt: lastRow?.syncedAt ?? null,
      totalCampaigns,
      activeCampaigns,
    },
  });
}
