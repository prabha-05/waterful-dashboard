import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Diagnostic only — show what Meta data is in the DB.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const totalCampaigns = await prisma.metaCampaign.count();
  const activeCampaigns = await prisma.metaCampaign.count({ where: { status: "ACTIVE" } });
  const pausedCampaigns = await prisma.metaCampaign.count({ where: { status: "PAUSED" } });
  const totalSpendDays = await prisma.metaAdSpendDaily.count();

  // Sum by campaign for last 30 days
  const recentSpend = await prisma.metaAdSpendDaily.findMany({
    orderBy: { date: "desc" },
    take: 50,
    include: { campaign: { select: { name: true, status: true } } },
  });

  const totalSpend = recentSpend.reduce((s, r) => s + r.spend, 0);
  const totalImpressions = recentSpend.reduce((s, r) => s + r.impressions, 0);
  const totalClicks = recentSpend.reduce((s, r) => s + r.clicks, 0);
  const totalPurchases = recentSpend.reduce((s, r) => s + r.purchases, 0);
  const totalPurchaseValue = recentSpend.reduce((s, r) => s + r.purchaseValue, 0);

  return NextResponse.json({
    counts: {
      totalCampaigns,
      activeCampaigns,
      pausedCampaigns,
      totalSpendDays,
    },
    recent30dTotals: {
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      purchases: totalPurchases,
      purchaseValue: totalPurchaseValue,
      roas: totalSpend > 0 ? totalPurchaseValue / totalSpend : 0,
    },
    spendRows: recentSpend.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      campaign: r.campaign.name,
      status: r.campaign.status,
      spend: r.spend,
      impressions: r.impressions,
      clicks: r.clicks,
      purchases: r.purchases,
      purchaseValue: r.purchaseValue,
    })),
  });
}
