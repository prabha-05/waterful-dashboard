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

// Build N consecutive IST-aligned buckets going FORWARD from startDay.
function buildBuckets(
  count: number,
  unit: string,
  startDay: Date
): { label: string; from: Date; to: Date }[] {
  const buckets: { label: string; from: Date; to: Date }[] = [];
  const start = startOfIstDay(startDay);

  for (let i = 0; i < count; i++) {
    let from: Date, to: Date, label: string;

    if (unit === "day") {
      from = addDays(start, i);
      to = addDays(from, 1);
      label = formatIstShort(from);
    } else if (unit === "week") {
      const dayOfWeek = istDayOfWeek(start);
      const daysSinceMonday = (dayOfWeek + 6) % 7;
      const mondayOfStartWeek = addDays(start, -daysSinceMonday);
      from = addDays(mondayOfStartWeek, i * 7);
      to = addDays(from, 7);
      const lastDay = addDays(to, -1);
      label = `${formatIstShort(from)} – ${formatIstShort(lastDay)}`;
    } else {
      const monthStart = startOfIstMonth(start);
      from = addIstMonths(monthStart, i);
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

  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end"); // back-compat
  let startDay: Date;
  if (startParam) {
    startDay = new Date(startParam);
  } else if (endParam) {
    startDay = addDays(new Date(endParam), -(count - 1));
  } else {
    startDay = addDays(new Date(), -(count - 1));
  }

  const buckets = buildBuckets(count, unit, startDay);
  const globalFrom = buckets[0].from;
  const globalTo = buckets[buckets.length - 1].to;

  // Previous equivalent window (for deltas)
  const windowMs = globalTo.getTime() - globalFrom.getTime();
  const prevTo = new Date(globalFrom.getTime());
  const prevFrom = new Date(globalFrom.getTime() - windowMs);

  // Pull all spend rows for current + previous window
  const spendRows = await prisma.metaAdSpendDaily.findMany({
    where: { date: { gte: prevFrom, lt: globalTo } },
    include: { campaign: { select: { name: true, status: true, objective: true } } },
  });

  // Build per-bucket totals (across all campaigns)
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

  // Per-campaign bucket breakdown so the chart can respect the campaign filter.
  // Keyed by campaign name (which is what the dropdown uses).
  const periodsByCampaign: Record<string, Period[]> = {};
  for (const r of spendRows.filter((r) => r.date >= globalFrom && r.date < globalTo)) {
    if (!periodsByCampaign[r.campaign.name]) {
      periodsByCampaign[r.campaign.name] = buckets.map((b) => ({
        label: b.label,
        from: formatIstYmd(b.from),
        to: formatIstYmd(b.to),
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        purchases: 0,
        purchaseValue: 0,
      }));
    }
  }
  for (const name of Object.keys(periodsByCampaign)) {
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const inBucket = spendRows.filter(
        (r) => r.campaign.name === name && r.date >= b.from && r.date < b.to
      );
      const p = periodsByCampaign[name][i];
      p.spend = Math.round(inBucket.reduce((s, r) => s + r.spend, 0));
      p.impressions = inBucket.reduce((s, r) => s + r.impressions, 0);
      p.reach = inBucket.reduce((s, r) => s + r.reach, 0);
      p.clicks = inBucket.reduce((s, r) => s + r.clicks, 0);
      p.purchases = inBucket.reduce((s, r) => s + r.purchases, 0);
      p.purchaseValue = Math.round(inBucket.reduce((s, r) => s + r.purchaseValue, 0));
    }
  }

  // Current totals
  const inWindow = spendRows.filter(
    (r) => r.date >= globalFrom && r.date < globalTo
  );
  const totals = {
    spend: Math.round(inWindow.reduce((s, r) => s + r.spend, 0)),
    impressions: inWindow.reduce((s, r) => s + r.impressions, 0),
    reach: inWindow.reduce((s, r) => s + r.reach, 0),
    clicks: inWindow.reduce((s, r) => s + r.clicks, 0),
    addToCart: inWindow.reduce((s, r) => s + r.addToCart, 0),
    initiateCheckout: inWindow.reduce((s, r) => s + r.initiateCheckout, 0),
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
    addToCart: prevInWindow.reduce((s, r) => s + r.addToCart, 0),
    initiateCheckout: prevInWindow.reduce((s, r) => s + r.initiateCheckout, 0),
    purchases: prevInWindow.reduce((s, r) => s + r.purchases, 0),
    purchaseValue: Math.round(
      prevInWindow.reduce((s, r) => s + r.purchaseValue, 0)
    ),
  };

  // Per-campaign previous-period totals so deltas can be computed when a
  // specific campaign is selected. Keyed by campaign name (matches dropdown).
  const previousTotalsByCampaign: Record<string, typeof previousTotals> = {};
  for (const r of prevInWindow) {
    if (!previousTotalsByCampaign[r.campaign.name]) {
      previousTotalsByCampaign[r.campaign.name] = {
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        addToCart: 0,
        initiateCheckout: 0,
        purchases: 0,
        purchaseValue: 0,
      };
    }
    const p = previousTotalsByCampaign[r.campaign.name];
    p.spend += r.spend;
    p.impressions += r.impressions;
    p.reach += r.reach;
    p.clicks += r.clicks;
    p.addToCart += r.addToCart;
    p.initiateCheckout += r.initiateCheckout;
    p.purchases += r.purchases;
    p.purchaseValue += r.purchaseValue;
  }
  for (const name of Object.keys(previousTotalsByCampaign)) {
    previousTotalsByCampaign[name].spend = Math.round(previousTotalsByCampaign[name].spend);
    previousTotalsByCampaign[name].purchaseValue = Math.round(previousTotalsByCampaign[name].purchaseValue);
  }

  // Campaign-level breakdown for the current window
  type LevelMetrics = {
    name: string;
    status: string;
    spend: number;
    impressions: number;
    clicks: number;
    addToCart: number;
    initiateCheckout: number;
    purchases: number;
    purchaseValue: number;
    // Frequency is a weighted average (sum of frequency*impressions / sum of
    // impressions). For campaign-level we aggregate from ad-set rows since
    // MetaAdSpendDaily doesn't carry frequency. Set 0 to start; computed below.
    frequencyNumerator: number; // sum(freq × impressions)
  };

  const campaignMap = new Map<
    number, // MetaCampaign.id (DB pk)
    LevelMetrics & {
      metaCampaignId: string; // Shopify-side string ID
      objective: string | null;
      reach: number;
    }
  >();

  for (const r of inWindow) {
    const existing = campaignMap.get(r.campaignId);
    if (existing) {
      existing.spend += r.spend;
      existing.impressions += r.impressions;
      existing.reach += r.reach;
      existing.clicks += r.clicks;
      existing.addToCart += r.addToCart;
      existing.initiateCheckout += r.initiateCheckout;
      existing.purchases += r.purchases;
      existing.purchaseValue += r.purchaseValue;
    } else {
      campaignMap.set(r.campaignId, {
        metaCampaignId: "", // filled below
        objective: r.campaign.objective,
        name: r.campaign.name,
        status: r.campaign.status,
        spend: r.spend,
        impressions: r.impressions,
        reach: r.reach,
        clicks: r.clicks,
        addToCart: r.addToCart,
        initiateCheckout: r.initiateCheckout,
        purchases: r.purchases,
        purchaseValue: r.purchaseValue,
        frequencyNumerator: 0,
      });
    }
  }

  // Look up metaCampaignId (string) for each campaign DB id
  if (campaignMap.size > 0) {
    const campRows = await prisma.metaCampaign.findMany({
      where: { id: { in: Array.from(campaignMap.keys()) } },
      select: { id: true, metaCampaignId: true },
    });
    for (const c of campRows) {
      const m = campaignMap.get(c.id);
      if (m) m.metaCampaignId = c.metaCampaignId;
    }
  }

  // Ad set + ad breakdown within the same window — nested under each campaign
  const adSetRows = await prisma.metaAdSetDaily.findMany({
    where: { date: { gte: globalFrom, lt: globalTo } },
    include: { adSet: { select: { name: true, status: true, metaCampaignId: true } } },
  });
  const adSetMap = new Map<
    number,
    LevelMetrics & { metaCampaignId: string }
  >();
  for (const r of adSetRows) {
    const existing = adSetMap.get(r.adSetId);
    if (existing) {
      existing.spend += r.spend;
      existing.impressions += r.impressions;
      existing.clicks += r.clicks;
      existing.addToCart += r.addToCart;
      existing.initiateCheckout += r.initiateCheckout;
      existing.purchases += r.purchases;
      existing.purchaseValue += r.purchaseValue;
      existing.frequencyNumerator += r.frequency * r.impressions;
    } else {
      adSetMap.set(r.adSetId, {
        metaCampaignId: r.adSet.metaCampaignId,
        name: r.adSet.name,
        status: r.adSet.status,
        spend: r.spend,
        impressions: r.impressions,
        clicks: r.clicks,
        addToCart: r.addToCart,
        initiateCheckout: r.initiateCheckout,
        purchases: r.purchases,
        purchaseValue: r.purchaseValue,
        frequencyNumerator: r.frequency * r.impressions,
      });
    }
  }

  const adRows = await prisma.metaAdDaily.findMany({
    where: { date: { gte: globalFrom, lt: globalTo } },
    include: { ad: { select: { name: true, status: true, adSetId: true } } },
  });
  const adMap = new Map<
    number,
    LevelMetrics & { adSetId: number }
  >();
  for (const r of adRows) {
    const existing = adMap.get(r.adId);
    if (existing) {
      existing.spend += r.spend;
      existing.impressions += r.impressions;
      existing.clicks += r.clicks;
      existing.addToCart += r.addToCart;
      existing.initiateCheckout += r.initiateCheckout;
      existing.purchases += r.purchases;
      existing.purchaseValue += r.purchaseValue;
      existing.frequencyNumerator += r.frequency * r.impressions;
    } else {
      adMap.set(r.adId, {
        adSetId: r.ad.adSetId,
        name: r.ad.name,
        status: r.ad.status,
        spend: r.spend,
        impressions: r.impressions,
        clicks: r.clicks,
        addToCart: r.addToCart,
        initiateCheckout: r.initiateCheckout,
        purchases: r.purchases,
        purchaseValue: r.purchaseValue,
        frequencyNumerator: r.frequency * r.impressions,
      });
    }
  }

  // Roll ad-set frequency numerators up to their parent campaigns
  for (const a of adSetMap.values()) {
    for (const c of campaignMap.values()) {
      if (c.metaCampaignId === a.metaCampaignId) {
        c.frequencyNumerator += a.frequencyNumerator;
        break;
      }
    }
  }

  // Compute derived metrics for a single level row
  const withMetrics = <T extends LevelMetrics>(m: T) => {
    const { frequencyNumerator, ...rest } = m;
    return {
      ...rest,
      spend: Math.round(m.spend),
      purchaseValue: Math.round(m.purchaseValue),
      ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
      cpc: m.clicks > 0 ? m.spend / m.clicks : 0,
      cpa: m.purchases > 0 ? m.spend / m.purchases : 0,
      roas: m.spend > 0 ? m.purchaseValue / m.spend : 0,
      frequency: m.impressions > 0 ? frequencyNumerator / m.impressions : 0,
    };
  };

  // Build the nested campaign → adsets → ads structure
  const campaigns = Array.from(campaignMap.values())
    .map((c) => {
      const campAdSets = Array.from(adSetMap.entries())
        .filter(([, a]) => a.metaCampaignId === c.metaCampaignId)
        .map(([adSetId, a]) => {
          const setAds = Array.from(adMap.values())
            .filter((ad) => ad.adSetId === adSetId)
            .map(({ adSetId: _ignore, ...rest }) => withMetrics(rest))
            .sort((a, b) => b.spend - a.spend);
          const { metaCampaignId: _ignore2, ...rest } = a;
          return { ...withMetrics(rest), ads: setAds };
        })
        .sort((a, b) => b.spend - a.spend);
      const { reach: _reach, objective, ...rest } = c;
      return { ...withMetrics(rest), objective, adSets: campAdSets };
    })
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

  // Shopify "reality" — actual net orders + revenue in this window. Used by
  // the Reality Check panel to compare against Meta's Pixel-reported numbers
  // (which routinely undercount because of iOS 14+ ATT, ad blockers, and
  // third-party checkouts like GoKwik that break browser Pixel firing).
  const shopifyNet = await prisma.shopifyOrder.findMany({
    where: {
      createdAt: { gte: globalFrom, lt: globalTo },
      cancelledAt: null,
      financialStatus: { notIn: ["voided", "refunded"] },
    },
    select: { totalPrice: true },
  });
  const shopifyReality = {
    orders: shopifyNet.length,
    revenue: Math.round(shopifyNet.reduce((s, o) => s + o.totalPrice, 0)),
  };

  return NextResponse.json({
    count,
    unit,
    periods,
    periodsByCampaign,
    totals,
    previousTotalsByCampaign,
    previousTotals,
    previousWindow: {
      from: formatIstYmd(prevFrom),
      to: formatIstYmd(prevTo),
    },
    campaigns,
    shopifyReality,
    meta: {
      lastSyncedAt: lastRow?.syncedAt ?? null,
      totalCampaigns,
      activeCampaigns,
    },
  });
}
