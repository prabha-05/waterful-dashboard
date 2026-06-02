import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startOfIstDay, addDays, formatIstYmd, formatIstShort } from "@/lib/timezone";

// Daily aggregate per campaign for current + prior windows. Powers the
// Trends → Campaigns page (rolling-window comparison with sparklines).

type DailyPoint = { date: string; label: string; value: number };

type CampaignTrend = {
  metaCampaignId: string;
  name: string;
  status: string;
  objective: string | null;
  tags: { buyingType: "CBO" | "ABO" | null; advantagePlus: boolean; kind: "Scaling" | "Testing" | null };
  adSetsCount: number;
  adsCount: number;
  dailyBudget: number | null;
  current: {
    spend: number;
    purchases: number;
    purchaseValue: number;
    reach: number;
    impressions: number;
    roas: number;
    cpp: number;
    frequency: number;
  };
  previous: null | {
    spend: number;
    purchases: number;
    purchaseValue: number;
    reach: number;
    impressions: number;
    roas: number;
    cpp: number;
    frequency: number;
  };
  // Daily sparkline series (current window)
  series: {
    spend: DailyPoint[];
    roas: DailyPoint[];
    cpp: DailyPoint[];
    purchases: DailyPoint[];
    reach: DailyPoint[];
    frequency: DailyPoint[];
  };
};

export async function GET(req: NextRequest) {
  const days = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("days") || "3"), 1),
    30
  );

  // Window: end = today (IST start-of-day), start = end - days
  // Prior:  same length immediately before
  const todayStart = startOfIstDay(new Date());
  const currentEnd = todayStart; // exclusive
  const currentStart = addDays(currentEnd, -days);
  const priorEnd = currentStart;
  const priorStart = addDays(priorEnd, -days);

  // Pull campaign-level spend daily for both windows
  const spendRows = await prisma.metaAdSpendDaily.findMany({
    where: { date: { gte: priorStart, lt: currentEnd } },
    include: { campaign: { select: { metaCampaignId: true, name: true, status: true, objective: true, dailyBudget: true } } },
  });

  // For frequency we need ad-set-level rows (campaign-level table has no
  // frequency column). Aggregate weighted average: sum(freq * impressions) /
  // sum(impressions) across the campaign's ad sets.
  const adSetRows = await prisma.metaAdSetDaily.findMany({
    where: { date: { gte: priorStart, lt: currentEnd } },
    include: { adSet: { select: { metaCampaignId: true } } },
  });

  // Counts of ad sets and ads per campaign (live, not just spending in window)
  // Also sum each campaign's active ad-set daily budgets so that ABO campaigns
  // (no campaign-level budget on Meta) can still show a reference figure.
  const allAdSets = await prisma.metaAdSet.findMany({
    select: { metaCampaignId: true, dailyBudget: true, status: true },
  });
  const adSetsCountByCamp = new Map<string, number>();
  const adSetBudgetSumByCamp = new Map<string, number>();
  for (const a of allAdSets) {
    adSetsCountByCamp.set(a.metaCampaignId, (adSetsCountByCamp.get(a.metaCampaignId) ?? 0) + 1);
    // Only count ACTIVE ad-sets — paused ones aren't actually contributing.
    if (a.status?.toUpperCase() === "ACTIVE" && a.dailyBudget && a.dailyBudget > 0) {
      adSetBudgetSumByCamp.set(
        a.metaCampaignId,
        (adSetBudgetSumByCamp.get(a.metaCampaignId) ?? 0) + a.dailyBudget,
      );
    }
  }
  const allAds = await prisma.metaAd.findMany({
    select: { adSet: { select: { metaCampaignId: true } } },
  });
  const adsCountByCamp = new Map<string, number>();
  for (const a of allAds) {
    const cid = a.adSet.metaCampaignId;
    adsCountByCamp.set(cid, (adsCountByCamp.get(cid) ?? 0) + 1);
  }

  // Build day-buckets for the current window (for sparklines)
  const dayBuckets: { from: Date; to: Date; ymd: string; label: string }[] = [];
  for (let i = 0; i < days; i++) {
    const from = addDays(currentStart, i);
    const to = addDays(from, 1);
    dayBuckets.push({ from, to, ymd: formatIstYmd(from), label: formatIstShort(from) });
  }

  // Per-campaign accumulators
  type Acc = {
    metaCampaignId: string;
    name: string;
    status: string;
    objective: string | null;
    dailyBudget: number | null;
    // Aggregates across current window
    cur: { spend: number; purchases: number; purchaseValue: number; reach: number; impressions: number };
    prev: { spend: number; purchases: number; purchaseValue: number; reach: number; impressions: number };
    // For sparklines — per-day in current window
    daily: Map<string, { spend: number; purchases: number; purchaseValue: number; reach: number; impressions: number }>;
  };
  const camps = new Map<string, Acc>();
  const ensureCamp = (cid: string, name: string, status: string, objective: string | null, dailyBudget: number | null) => {
    if (!camps.has(cid)) {
      camps.set(cid, {
        metaCampaignId: cid,
        name,
        status,
        objective,
        dailyBudget,
        cur: { spend: 0, purchases: 0, purchaseValue: 0, reach: 0, impressions: 0 },
        prev: { spend: 0, purchases: 0, purchaseValue: 0, reach: 0, impressions: 0 },
        daily: new Map(),
      });
    }
    return camps.get(cid)!;
  };

  for (const r of spendRows) {
    const inCurrent = r.date >= currentStart && r.date < currentEnd;
    const a = ensureCamp(
      r.campaign.metaCampaignId,
      r.campaign.name,
      r.campaign.status,
      r.campaign.objective,
      r.campaign.dailyBudget,
    );
    const bucket = inCurrent ? a.cur : a.prev;
    bucket.spend += r.spend;
    bucket.purchases += r.purchases;
    bucket.purchaseValue += r.purchaseValue;
    bucket.reach += r.reach;
    bucket.impressions += r.impressions;

    if (inCurrent) {
      const ymd = formatIstYmd(r.date);
      const d = a.daily.get(ymd) ?? { spend: 0, purchases: 0, purchaseValue: 0, reach: 0, impressions: 0 };
      d.spend += r.spend;
      d.purchases += r.purchases;
      d.purchaseValue += r.purchaseValue;
      d.reach += r.reach;
      d.impressions += r.impressions;
      a.daily.set(ymd, d);
    }
  }

  // Frequency (weighted by impressions, per campaign per day + window totals).
  // Track numerator (sum freq*imp) separately, divide later.
  const freqAgg = new Map<
    string,
    { cur: { num: number; den: number }; prev: { num: number; den: number }; daily: Map<string, { num: number; den: number }> }
  >();
  const ensureFreq = (cid: string) => {
    if (!freqAgg.has(cid)) {
      freqAgg.set(cid, { cur: { num: 0, den: 0 }, prev: { num: 0, den: 0 }, daily: new Map() });
    }
    return freqAgg.get(cid)!;
  };
  for (const r of adSetRows) {
    const cid = r.adSet.metaCampaignId;
    const f = ensureFreq(cid);
    const inCurrent = r.date >= currentStart && r.date < currentEnd;
    const slot = inCurrent ? f.cur : f.prev;
    slot.num += r.frequency * r.impressions;
    slot.den += r.impressions;
    if (inCurrent) {
      const ymd = formatIstYmd(r.date);
      const d = f.daily.get(ymd) ?? { num: 0, den: 0 };
      d.num += r.frequency * r.impressions;
      d.den += r.impressions;
      f.daily.set(ymd, d);
    }
  }

  // Build response rows
  const campaigns: CampaignTrend[] = Array.from(camps.values()).map((c) => {
    const f = freqAgg.get(c.metaCampaignId);
    const buildSeries = (key: "spend" | "purchases" | "reach" | "purchaseValue"): DailyPoint[] =>
      dayBuckets.map((b) => ({
        date: b.ymd,
        label: b.label,
        value: c.daily.get(b.ymd)?.[key] ?? 0,
      }));
    const series = {
      spend: buildSeries("spend"),
      purchases: buildSeries("purchases"),
      reach: buildSeries("reach"),
      roas: dayBuckets.map((b) => {
        const d = c.daily.get(b.ymd);
        const v = d && d.spend > 0 ? d.purchaseValue / d.spend : 0;
        return { date: b.ymd, label: b.label, value: v };
      }),
      cpp: dayBuckets.map((b) => {
        const d = c.daily.get(b.ymd);
        const v = d && d.purchases > 0 ? d.spend / d.purchases : 0;
        return { date: b.ymd, label: b.label, value: v };
      }),
      frequency: dayBuckets.map((b) => {
        const d = f?.daily.get(b.ymd);
        const v = d && d.den > 0 ? d.num / d.den : 0;
        return { date: b.ymd, label: b.label, value: v };
      }),
    };

    const curRoas = c.cur.spend > 0 ? c.cur.purchaseValue / c.cur.spend : 0;
    const prevRoas = c.prev.spend > 0 ? c.prev.purchaseValue / c.prev.spend : 0;
    const curCpp = c.cur.purchases > 0 ? c.cur.spend / c.cur.purchases : 0;
    const prevCpp = c.prev.purchases > 0 ? c.prev.spend / c.prev.purchases : 0;
    const curFreq = f && f.cur.den > 0 ? f.cur.num / f.cur.den : 0;
    const prevFreq = f && f.prev.den > 0 ? f.prev.num / f.prev.den : 0;

    // Derive tags
    const nameLower = c.name.toLowerCase();
    const kind: "Scaling" | "Testing" | null = nameLower.includes("scaling")
      ? "Scaling"
      : nameLower.includes("testing") || nameLower.includes("broad")
      ? "Testing"
      : null;
    // CBO if campaign has a daily/lifetime budget; ABO otherwise (ad-set budgets)
    const buyingType: "CBO" | "ABO" | null =
      c.dailyBudget && c.dailyBudget > 0 ? "CBO" : "ABO";
    const advantagePlus =
      c.objective?.toLowerCase().includes("advantage") ||
      nameLower.includes("adv+") ||
      nameLower.includes("adv ");

    return {
      metaCampaignId: c.metaCampaignId,
      name: c.name,
      status: c.status,
      objective: c.objective,
      tags: { buyingType, advantagePlus: Boolean(advantagePlus), kind },
      adSetsCount: adSetsCountByCamp.get(c.metaCampaignId) ?? 0,
      adsCount: adsCountByCamp.get(c.metaCampaignId) ?? 0,
      // CBO campaigns have a campaign-level dailyBudget; ABO campaigns don't,
      // so fall back to the sum of their active ad-sets' daily budgets.
      dailyBudget: c.dailyBudget && c.dailyBudget > 0
        ? c.dailyBudget
        : adSetBudgetSumByCamp.get(c.metaCampaignId) ?? null,
      current: {
        spend: Math.round(c.cur.spend),
        purchases: c.cur.purchases,
        purchaseValue: Math.round(c.cur.purchaseValue),
        reach: c.cur.reach,
        impressions: c.cur.impressions,
        roas: curRoas,
        cpp: curCpp,
        frequency: curFreq,
      },
      previous: c.prev.spend === 0 && c.prev.purchases === 0 ? null : {
        spend: Math.round(c.prev.spend),
        purchases: c.prev.purchases,
        purchaseValue: Math.round(c.prev.purchaseValue),
        reach: c.prev.reach,
        impressions: c.prev.impressions,
        roas: prevRoas,
        cpp: prevCpp,
        frequency: prevFreq,
      },
      series,
    };
  }).sort((a, b) => b.current.spend - a.current.spend);

  // Alerts — surface the most important per-campaign issues. Ordered: red
  // (urgent) → amber (watch) → green (wins). Limit total to 6 to keep the
  // bar readable.
  type Alert = { tone: "red" | "amber" | "green"; text: string; sortKey: number };
  const alerts: Alert[] = [];
  for (const c of campaigns) {
    if (c.current.spend === 0) continue;
    const short = c.name.length > 28 ? c.name.slice(0, 28) + "…" : c.name;

    // RED — urgent problems
    if (c.current.roas > 0 && c.current.roas < 1 && c.current.spend > 2000) {
      alerts.push({ tone: "red", sortKey: 0, text: `${short} — ROAS ${c.current.roas.toFixed(2)}x (losing money)` });
    }
    if (c.previous && c.previous.roas > 0) {
      const delta = (c.current.roas - c.previous.roas) / c.previous.roas;
      if (delta <= -0.3) {
        alerts.push({ tone: "red", sortKey: 1, text: `${short} — ROAS ${c.current.roas.toFixed(2)}x (${(delta * 100).toFixed(0)}% vs prior)` });
      } else if (delta >= 0.15) {
        alerts.push({ tone: "green", sortKey: 10, text: `${short} — ROAS ${c.current.roas.toFixed(2)}x (+${(delta * 100).toFixed(0)}%)` });
      }
    }
    if (c.current.cpp > 2500 && c.current.purchases > 0) {
      alerts.push({ tone: "red", sortKey: 2, text: `${short} — CPP Rs.${Math.round(c.current.cpp).toLocaleString("en-IN")} (above ceiling)` });
    }
    if (c.previous && c.previous.purchases > 0) {
      const pDelta = (c.current.purchases - c.previous.purchases) / c.previous.purchases;
      if (pDelta <= -0.3 && c.previous.purchases >= 5) {
        alerts.push({ tone: "red", sortKey: 3, text: `${short} — Purchases ${c.current.purchases} (${(pDelta * 100).toFixed(0)}% vs prior)` });
      }
    }

    // AMBER — needs watching
    // ROAS below target (1.8x) but still profitable (>=1x)
    if (c.current.roas >= 1 && c.current.roas < 1.5 && c.current.spend > 5000) {
      alerts.push({ tone: "amber", sortKey: 4, text: `${short} — ROAS ${c.current.roas.toFixed(2)}x (below 1.8x target)` });
    }
    if (c.current.frequency > 3) {
      alerts.push({ tone: "amber", sortKey: 5, text: `${short} — Frequency ${c.current.frequency.toFixed(1)}x (above threshold)` });
    }
    // Budget drift — compare daily spend to Meta's actual daily budget.
    const planned = c.dailyBudget && c.dailyBudget > 0 ? c.dailyBudget : null;
    if (planned && planned > 0) {
      const dailySpend = c.current.spend / days;
      const util = (dailySpend / planned) * 100;
      if (util < 60) {
        alerts.push({ tone: "amber", sortKey: 6, text: `${short} — Under-spending (${util.toFixed(0)}% of Rs.${planned.toLocaleString("en-IN")} daily)` });
      } else if (util > 130) {
        alerts.push({ tone: "red", sortKey: 1.5, text: `${short} — Over-spending (${util.toFixed(0)}% of Rs.${planned.toLocaleString("en-IN")} daily)` });
      }
    }
  }
  alerts.sort((a, b) => a.sortKey - b.sortKey);
  const trimmedAlerts: { tone: Alert["tone"]; text: string }[] = alerts.slice(0, 6).map(({ tone, text }) => ({ tone, text }));

  return NextResponse.json({
    days,
    window: { from: formatIstYmd(currentStart), to: formatIstYmd(addDays(currentEnd, -1)) },
    priorWindow: { from: formatIstYmd(priorStart), to: formatIstYmd(addDays(priorEnd, -1)) },
    campaigns,
    alerts: trimmedAlerts,
  });
}
