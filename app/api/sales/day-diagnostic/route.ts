import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Day-level explainer. For a given date, compares vs the prior day across
// Shopify + Meta and returns a ranked list of the strongest reasons for the
// revenue / order delta. Surfaced in the dashboard via the date-click action.

type Reason = {
  tone: "good" | "warn" | "bad" | "neutral";
  headline: string;
  detail: string;
  impactScore: number; // higher = more important to display first
};

function startUtc(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}
function shiftDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86400000);
}
function fmtInr(v: number) {
  if (v < 0) return `-Rs.${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
  return `Rs.${Math.round(v).toLocaleString("en-IN")}`;
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  }

  const dayStart = startUtc(date);
  const dayEnd = shiftDays(dayStart, 1);
  const prevStart = shiftDays(dayStart, -1);

  // 1. Shopify orders for both days
  const [orders, prevOrders] = await Promise.all([
    prisma.shopifyOrder.findMany({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
      select: {
        totalPrice: true, financialStatus: true, cancelledAt: true,
        createdAt: true, shopifyCustomerId: true, noteAttributes: true,
      },
    }),
    prisma.shopifyOrder.findMany({
      where: { createdAt: { gte: prevStart, lt: dayStart } },
      select: {
        totalPrice: true, financialStatus: true, cancelledAt: true,
        createdAt: true, shopifyCustomerId: true, noteAttributes: true,
      },
    }),
  ]);

  function shopifySummary(rows: typeof orders) {
    let net = 0, gross = 0, cancelled = 0, pending = 0;
    const newCust = new Set<string>(), repeat = new Set<string>();
    const seenIds = new Set<string>();
    const utm: Record<string, number> = {};
    const hours = Array(24).fill(0); // IST hours
    for (const r of rows) {
      gross += r.totalPrice;
      const isCancelled = r.cancelledAt || r.financialStatus === "voided" || r.financialStatus === "refunded";
      if (isCancelled) cancelled++; else net += r.totalPrice;
      if (r.financialStatus === "pending") pending++;
      // Convert UTC to IST (+5:30)
      const ist = new Date(r.createdAt.getTime() + 5.5 * 3600 * 1000);
      hours[ist.getUTCHours()]++;
      // Customer classification — for this method, "repeat" = customer ID seen in another order in this batch.
      // Cheap heuristic; the real new/repeat split is handled by mirror/sales-aggregations elsewhere.
      if (r.shopifyCustomerId) {
        const id = r.shopifyCustomerId.toString();
        if (seenIds.has(id)) repeat.add(id);
        else { newCust.add(id); seenIds.add(id); }
      }
      if (r.noteAttributes) {
        try {
          const arr = JSON.parse(r.noteAttributes) as { name: string; value: string }[];
          const map = new Map(arr.map((a) => [a.name, a.value]));
          const src = (map.get("utm_source") || "direct").toLowerCase();
          utm[src] = (utm[src] || 0) + 1;
        } catch {
          // ignore parse errors
        }
      }
    }
    return { orders: rows.length, net, gross, cancelled, pending, newCust: newCust.size, repeat: repeat.size, utm, hours };
  }

  const cur = shopifySummary(orders);
  const prev = shopifySummary(prevOrders);

  // 2. Meta data
  const [metaCur, metaPrev] = await Promise.all([
    prisma.metaAdSpendDaily.findMany({
      where: { date: { gte: dayStart, lt: dayEnd } },
      include: { campaign: { select: { name: true } } },
    }),
    prisma.metaAdSpendDaily.findMany({
      where: { date: { gte: prevStart, lt: dayStart } },
      include: { campaign: { select: { name: true } } },
    }),
  ]);

  function metaTotals(rows: typeof metaCur) {
    let spend = 0, impressions = 0, clicks = 0, purchases = 0, purchaseValue = 0;
    for (const r of rows) {
      spend += r.spend; impressions += r.impressions; clicks += r.clicks;
      purchases += r.purchases; purchaseValue += r.purchaseValue;
    }
    return { spend, impressions, clicks, purchases, purchaseValue };
  }
  const mCur = metaTotals(metaCur);
  const mPrev = metaTotals(metaPrev);

  // 3. Per-ad-set comparison (which set's purchases dropped most relative to spend)
  const [adSetsCur, adSetsPrev] = await Promise.all([
    prisma.metaAdSetDaily.findMany({
      where: { date: { gte: dayStart, lt: dayEnd } },
      include: { adSet: { select: { name: true, metaAdSetId: true } } },
    }),
    prisma.metaAdSetDaily.findMany({
      where: { date: { gte: prevStart, lt: dayStart } },
      include: { adSet: { select: { name: true, metaAdSetId: true } } },
    }),
  ]);
  const mapCur = new Map(adSetsCur.map((r) => [r.adSet.metaAdSetId, r]));
  const mapPrev = new Map(adSetsPrev.map((r) => [r.adSet.metaAdSetId, r]));
  const allIds = new Set([...mapCur.keys(), ...mapPrev.keys()]);
  type AdSetDelta = { name: string; spend: number; spendPrev: number; purch: number; purchPrev: number; rev: number; revPrev: number };
  const deltas: AdSetDelta[] = [];
  for (const id of allIds) {
    const a = mapCur.get(id); const b = mapPrev.get(id);
    deltas.push({
      name: (a?.adSet.name ?? b?.adSet.name ?? "").trim(),
      spend: a?.spend ?? 0,
      spendPrev: b?.spend ?? 0,
      purch: a?.purchases ?? 0,
      purchPrev: b?.purchases ?? 0,
      rev: a?.purchaseValue ?? 0,
      revPrev: b?.purchaseValue ?? 0,
    });
  }

  // ----- Headline numbers -----
  const orderDelta = cur.orders - prev.orders;
  const netRevDelta = cur.net - prev.net;
  const netRevDeltaPct = prev.net > 0 ? (netRevDelta / prev.net) * 100 : 0;

  const reasons: Reason[] = [];

  // ----- Reason: ad-set collapse (purchases dropped much more than spend) -----
  for (const d of deltas) {
    if (d.spendPrev < 1000 && d.spend < 1000) continue; // ignore tiny ad sets
    const purchDelta = d.purch - d.purchPrev;
    if (purchDelta >= 0) continue; // only flag drops
    const spendDeltaPct = d.spendPrev > 0 ? ((d.spend - d.spendPrev) / d.spendPrev) * 100 : 0;
    const purchDeltaPct = d.purchPrev > 0 ? (purchDelta / d.purchPrev) * 100 : 0;
    // A collapse = purchases fell >40% AND faster than spend by ≥25 points
    if (purchDeltaPct <= -40 && purchDeltaPct - spendDeltaPct <= -25 && d.purchPrev >= 5) {
      reasons.push({
        tone: "bad",
        headline: `Ad set "${d.name.slice(0, 36)}" lost momentum`,
        detail: `Purchases ${d.purchPrev} → ${d.purch} (${purchDeltaPct.toFixed(0)}%) on similar spend — looks like creative fatigue or audience saturation.`,
        impactScore: Math.abs(purchDelta) * 100,
      });
    }
  }

  // ----- Reason: Meta spend pulled back -----
  const metaSpendDelta = mCur.spend - mPrev.spend;
  const metaSpendDeltaPct = mPrev.spend > 0 ? (metaSpendDelta / mPrev.spend) * 100 : 0;
  if (metaSpendDeltaPct <= -10) {
    reasons.push({
      tone: "warn",
      headline: `Meta spend was lower (${metaSpendDeltaPct.toFixed(0)}%)`,
      detail: `${fmtInr(mPrev.spend)} → ${fmtInr(mCur.spend)}. Fewer impressions ${mPrev.impressions.toLocaleString("en-IN")} → ${mCur.impressions.toLocaleString("en-IN")} means fewer eyeballs → fewer orders.`,
      impactScore: Math.abs(metaSpendDelta),
    });
  } else if (metaSpendDeltaPct >= 10) {
    reasons.push({
      tone: "good",
      headline: `Meta spend was higher (+${metaSpendDeltaPct.toFixed(0)}%)`,
      detail: `${fmtInr(mPrev.spend)} → ${fmtInr(mCur.spend)}. More impressions ${mPrev.impressions.toLocaleString("en-IN")} → ${mCur.impressions.toLocaleString("en-IN")} drove more reach.`,
      impactScore: Math.abs(metaSpendDelta),
    });
  }

  // ----- Reason: conversion-rate shift -----
  const ctrPrev = mPrev.impressions > 0 ? (mPrev.clicks / mPrev.impressions) * 100 : 0;
  const ctrCur = mCur.impressions > 0 ? (mCur.clicks / mCur.impressions) * 100 : 0;
  const ctrDelta = ctrCur - ctrPrev;
  if (Math.abs(ctrDelta) >= 0.2 && mCur.impressions > 5000) {
    reasons.push({
      tone: ctrDelta > 0 ? "good" : "warn",
      headline: `CTR ${ctrDelta > 0 ? "improved" : "weakened"} (${ctrPrev.toFixed(2)}% → ${ctrCur.toFixed(2)}%)`,
      detail: `${ctrDelta > 0 ? "More" : "Fewer"} people clicked the ads after seeing them.`,
      impactScore: Math.abs(ctrDelta) * 1000,
    });
  }
  const roasPrev = mPrev.spend > 0 ? mPrev.purchaseValue / mPrev.spend : 0;
  const roasCur = mCur.spend > 0 ? mCur.purchaseValue / mCur.spend : 0;
  if (Math.abs(roasCur - roasPrev) >= 0.2) {
    reasons.push({
      tone: roasCur >= roasPrev ? "good" : "bad",
      headline: `ROAS ${roasCur >= roasPrev ? "rose" : "fell"} (${roasPrev.toFixed(2)}x → ${roasCur.toFixed(2)}x)`,
      detail: `Meta-reported revenue per rupee spent ${roasCur >= roasPrev ? "improved" : "got worse"}.`,
      impactScore: Math.abs(roasCur - roasPrev) * 5000,
    });
  }

  // ----- Reason: time-of-day shift (evening orders) -----
  const eveningPrev = prev.hours.slice(18, 24).reduce((s, h) => s + h, 0);
  const eveningCur = cur.hours.slice(18, 24).reduce((s, h) => s + h, 0);
  if (Math.abs(eveningCur - eveningPrev) >= 5) {
    reasons.push({
      tone: eveningCur >= eveningPrev ? "good" : "warn",
      headline: `Evening orders (6pm–midnight) ${eveningCur >= eveningPrev ? "stronger" : "weaker"}`,
      detail: `${eveningPrev} → ${eveningCur} orders in evening hours.`,
      impactScore: Math.abs(eveningCur - eveningPrev) * 50,
    });
  }

  // ----- Reason: cancellation rate change -----
  const cancelPrev = prev.orders > 0 ? (prev.cancelled / prev.orders) * 100 : 0;
  const cancelCur = cur.orders > 0 ? (cur.cancelled / cur.orders) * 100 : 0;
  if (Math.abs(cancelCur - cancelPrev) >= 5 && cur.orders >= 10) {
    reasons.push({
      tone: cancelCur < cancelPrev ? "good" : "bad",
      headline: `Cancellation rate ${cancelCur < cancelPrev ? "improved" : "worsened"}`,
      detail: `${cancelPrev.toFixed(0)}% → ${cancelCur.toFixed(0)}% (${cur.cancelled} of ${cur.orders} orders cancelled/voided).`,
      impactScore: Math.abs(cancelCur - cancelPrev) * 20,
    });
  }

  // ----- Reason: source mix shift -----
  const adAttrPrev = (prev.utm.meta || 0) + (prev.utm.facebook || 0) + (prev.utm.instagram || 0);
  const adAttrCur = (cur.utm.meta || 0) + (cur.utm.facebook || 0) + (cur.utm.instagram || 0);
  if (Math.abs(adAttrCur - adAttrPrev) >= 5) {
    reasons.push({
      tone: adAttrCur >= adAttrPrev ? "good" : "warn",
      headline: `Meta-attributed orders ${adAttrCur >= adAttrPrev ? "up" : "down"} (${adAttrPrev} → ${adAttrCur})`,
      detail: `Orders coming directly from Meta ad clicks (via UTM).`,
      impactScore: Math.abs(adAttrCur - adAttrPrev) * 30,
    });
  }

  // ----- Reason: pending orders waiting to settle -----
  if (cur.pending >= 5 && cur.pending > prev.pending - 2) {
    reasons.push({
      tone: "neutral",
      headline: `${cur.pending} orders still pending`,
      detail: `Mostly cash-on-delivery. Some will convert to "paid" in the next 24-48h, so the real number for this day will be slightly higher.`,
      impactScore: cur.pending * 5,
    });
  }

  // Sort and trim
  reasons.sort((a, b) => b.impactScore - a.impactScore);
  const topReasons = reasons.slice(0, 5);

  // Overall verdict
  let verdict: { tone: "good" | "warn" | "bad" | "neutral"; label: string };
  if (Math.abs(netRevDeltaPct) < 10) verdict = { tone: "neutral", label: "Normal variation" };
  else if (netRevDeltaPct >= 20) verdict = { tone: "good", label: `Strong day (+${netRevDeltaPct.toFixed(0)}% vs prior)` };
  else if (netRevDeltaPct >= 10) verdict = { tone: "good", label: `Better than prior (+${netRevDeltaPct.toFixed(0)}%)` };
  else if (netRevDeltaPct <= -20) verdict = { tone: "bad", label: `Soft day (${netRevDeltaPct.toFixed(0)}% vs prior)` };
  else verdict = { tone: "warn", label: `Slightly down (${netRevDeltaPct.toFixed(0)}% vs prior)` };

  return NextResponse.json({
    date,
    prevDate: prevStart.toISOString().slice(0, 10),
    verdict,
    current: {
      orders: cur.orders, net: Math.round(cur.net), pending: cur.pending,
      newCust: cur.newCust, repeat: cur.repeat,
    },
    previous: {
      orders: prev.orders, net: Math.round(prev.net), pending: prev.pending,
      newCust: prev.newCust, repeat: prev.repeat,
    },
    meta: {
      current: { spend: Math.round(mCur.spend), purchases: mCur.purchases, roas: roasCur },
      previous: { spend: Math.round(mPrev.spend), purchases: mPrev.purchases, roas: roasPrev },
    },
    reasons: topReasons,
  });
}
