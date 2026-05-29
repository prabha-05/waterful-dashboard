import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type UtmResult = {
  source: string;
  medium: string | null;
  campaign: string | null;
  adId: string | null;
  campaignId: string | null;
  adSetId: string | null;
  placement: string | null;
};

// Parse Shopify's landing_site value (path+query) into UTM parts. Manually
// split on "?" since it's not a full URL.
function parseLandingSite(landingSite: string | null): UtmResult | null {
  if (!landingSite) return null;
  const qIdx = landingSite.indexOf("?");
  if (qIdx < 0) return null;
  const params = new URLSearchParams(landingSite.slice(qIdx + 1));
  const source = params.get("utm_source");
  if (!source) return null;
  return {
    source,
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    adId: params.get("utm_content"),
    campaignId: params.get("utm_id"),
    adSetId: params.get("utm_term"),
    placement: params.get("utm_placement"),
  };
}

// Parse GoKwik-style note_attributes (JSON string of {name,value}[]) into
// UTM parts. GoKwik puts utm_* as individual entries AND a `full_url`.
function parseNoteAttributes(noteAttributes: string | null): UtmResult | null {
  if (!noteAttributes) return null;
  let arr: Array<{ name: string; value: string }>;
  try {
    arr = JSON.parse(noteAttributes);
  } catch {
    return null;
  }
  const map = new Map(arr.map((a) => [a.name, a.value]));
  // Prefer the explicit utm_* entries
  if (map.has("utm_source")) {
    return {
      source: map.get("utm_source")!,
      medium: map.get("utm_medium") ?? null,
      campaign: map.get("utm_campaign") ?? null,
      adId: map.get("utm_content") ?? null,
      campaignId: map.get("utm_id") ?? null,
      adSetId: map.get("utm_term") ?? null,
      placement: map.get("utm_placement") ?? null,
    };
  }
  // Fallback: parse full_url query string if utm_* keys are absent
  const fullUrl = map.get("full_url");
  if (fullUrl) {
    const qIdx = fullUrl.indexOf("?");
    if (qIdx >= 0) {
      const params = new URLSearchParams(fullUrl.slice(qIdx + 1));
      const source = params.get("utm_source");
      if (source) {
        return {
          source,
          medium: params.get("utm_medium"),
          campaign: params.get("utm_campaign"),
          adId: params.get("utm_content"),
          campaignId: params.get("utm_id"),
          adSetId: params.get("utm_term"),
          placement: params.get("utm_placement"),
        };
      }
    }
  }
  return null;
}

// Resolve UTM: try landing_site first (native Shopify checkout), fall back
// to note_attributes (GoKwik and similar third-party checkouts).
function parseUtm(landingSite: string | null, noteAttributes: string | null): UtmResult | null {
  return parseLandingSite(landingSite) ?? parseNoteAttributes(noteAttributes);
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  // Include any order with attribution data — either Shopify-native landing
  // (landingSite) or third-party checkout custom fields (noteAttributes, used
  // by GoKwik and similar).
  const where: Record<string, unknown> = {
    OR: [{ landingSite: { not: null } }, { noteAttributes: { not: null } }],
  };
  if (from && to) {
    where.createdAt = { gte: new Date(from), lte: new Date(`${to}T23:59:59`) };
  } else {
    // Default: last 30 days
    const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    where.createdAt = { gte: thirtyAgo };
  }

  const orders = await prisma.shopifyOrder.findMany({
    where,
    select: {
      orderNumber: true,
      customerName: true,
      email: true,
      phone: true,
      totalPrice: true,
      createdAt: true,
      financialStatus: true,
      cancelledAt: true,
      landingSite: true,
      referringSite: true,
      sourceName: true,
      noteAttributes: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Build attribution rows
  type AttributedOrder = {
    orderNumber: number;
    customerName: string;
    email: string | null;
    phone: string | null;
    totalPrice: number;
    createdAt: string;
    status: string;
    source: string;
    campaign: string | null;
    campaignId: string | null;
    adId: string | null;
    adSetId: string | null;
    adName: string | null;
    adSetName: string | null;
    campaignName: string | null;
  };

  const attributed: AttributedOrder[] = [];
  const adIdsToLookup = new Set<string>();
  const campaignIdsToLookup = new Set<string>();
  const adSetIdsToLookup = new Set<string>();

  for (const o of orders) {
    const utm = parseUtm(o.landingSite, o.noteAttributes);
    if (!utm) continue;
    if (utm.adId) adIdsToLookup.add(utm.adId);
    if (utm.campaignId) campaignIdsToLookup.add(utm.campaignId);
    if (utm.adSetId) adSetIdsToLookup.add(utm.adSetId);
    attributed.push({
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      email: o.email,
      phone: o.phone,
      totalPrice: o.totalPrice,
      createdAt: o.createdAt.toISOString(),
      status: o.cancelledAt ? "cancelled" : o.financialStatus,
      source: utm.source,
      campaign: utm.campaign,
      campaignId: utm.campaignId,
      adId: utm.adId,
      adSetId: utm.adSetId,
      adName: null,
      adSetName: null,
      campaignName: null,
    });
  }

  // Resolve ad / ad-set / campaign names from our Meta tables
  if (adIdsToLookup.size > 0) {
    const ads = await prisma.metaAd.findMany({
      where: { metaAdId: { in: Array.from(adIdsToLookup) } },
      select: { metaAdId: true, name: true },
    });
    const map = new Map(ads.map((a) => [a.metaAdId, a.name]));
    for (const a of attributed) {
      if (a.adId) a.adName = map.get(a.adId) ?? null;
    }
  }
  if (adSetIdsToLookup.size > 0) {
    const adSets = await prisma.metaAdSet.findMany({
      where: { metaAdSetId: { in: Array.from(adSetIdsToLookup) } },
      select: { metaAdSetId: true, name: true },
    });
    const map = new Map(adSets.map((s) => [s.metaAdSetId, s.name]));
    for (const a of attributed) {
      if (a.adSetId) a.adSetName = map.get(a.adSetId) ?? null;
    }
  }
  if (campaignIdsToLookup.size > 0) {
    const camps = await prisma.metaCampaign.findMany({
      where: { metaCampaignId: { in: Array.from(campaignIdsToLookup) } },
      select: { metaCampaignId: true, name: true },
    });
    const map = new Map(camps.map((c) => [c.metaCampaignId, c.name]));
    for (const a of attributed) {
      if (a.campaignId) a.campaignName = map.get(a.campaignId) ?? null;
    }
  }

  // Aggregate by ad — top performers
  const byAd = new Map<
    string,
    { adId: string; adName: string | null; orders: number; revenue: number; customers: Set<string> }
  >();
  for (const a of attributed) {
    if (!a.adId) continue;
    const key = a.adId;
    if (!byAd.has(key)) {
      byAd.set(key, { adId: key, adName: a.adName, orders: 0, revenue: 0, customers: new Set() });
    }
    const e = byAd.get(key)!;
    e.orders++;
    if (a.status !== "cancelled") e.revenue += a.totalPrice;
    if (a.phone) e.customers.add(a.phone);
    else if (a.email) e.customers.add(a.email);
  }

  // Enrich each rollup row with Meta's own purchases / revenue / previewLink
  // for the same date window. Sort by Meta's purchases (descending).
  const windowStart = where.createdAt
    ? (where.createdAt as { gte: Date }).gte
    : new Date(0);
  const windowEnd = where.createdAt
    ? (where.createdAt as { lte?: Date; lt?: Date }).lte ?? (where.createdAt as { lt?: Date }).lt ?? new Date()
    : new Date();

  const rollupAdIds = Array.from(byAd.keys());
  const metaAds = rollupAdIds.length > 0
    ? await prisma.metaAd.findMany({
        where: { metaAdId: { in: rollupAdIds } },
        select: { id: true, metaAdId: true, previewLink: true },
      })
    : [];
  const metaAdInfo = new Map(metaAds.map((m) => [m.metaAdId, m]));
  const metaDailyRows = metaAds.length > 0
    ? await prisma.metaAdDaily.findMany({
        where: {
          adId: { in: metaAds.map((m) => m.id) },
          date: { gte: windowStart, lt: windowEnd },
        },
        select: { adId: true, purchases: true, purchaseValue: true },
      })
    : [];
  const metaByDbId = new Map<number, { purchases: number; purchaseValue: number }>();
  for (const r of metaDailyRows) {
    const e = metaByDbId.get(r.adId) ?? { purchases: 0, purchaseValue: 0 };
    e.purchases += r.purchases;
    e.purchaseValue += r.purchaseValue;
    metaByDbId.set(r.adId, e);
  }

  const adRollup = Array.from(byAd.values())
    .map((e) => {
      const info = metaAdInfo.get(e.adId);
      const metaAgg = info ? metaByDbId.get(info.id) ?? { purchases: 0, purchaseValue: 0 } : { purchases: 0, purchaseValue: 0 };
      return {
        adId: e.adId,
        adName: e.adName,
        orders: e.orders,
        revenue: Math.round(e.revenue),
        customers: e.customers.size,
        metaPurchases: metaAgg.purchases,
        metaRevenue: Math.round(metaAgg.purchaseValue),
        previewLink: info?.previewLink ?? null,
      };
    })
    .sort((a, b) => b.metaPurchases - a.metaPurchases || b.revenue - a.revenue);

  return NextResponse.json({
    totalOrders: orders.length,
    attributedOrders: attributed.length,
    coverage: orders.length > 0 ? (attributed.length / orders.length) * 100 : 0,
    orders: attributed,
    adRollup,
  });
}
