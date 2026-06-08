import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Returns daily Amazon sales for a date range. Powers the Amazon sales
// dashboard page. Date filter is inclusive on both ends.

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
}

export async function GET(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");

  // Default: last 30 days ending yesterday IST.
  const now = new Date();
  const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultTo = new Date(utcMidnight.getTime() - 86_400_000); // yesterday
  const defaultFrom = new Date(utcMidnight.getTime() - 30 * 86_400_000);

  const from = parseDate(fromParam) ?? defaultFrom;
  const to = parseDate(toParam) ?? defaultTo;
  // Inclusive `to` — query expects strict <, so add a day.
  const toExclusive = new Date(to.getTime() + 86_400_000);

  const rows = await prisma.amazonDailySales.findMany({
    where: { date: { gte: from, lt: toExclusive } },
    orderBy: { date: "asc" },
  });

  // Latest upload timestamp (most recent updatedAt across the whole table)
  const latest = await prisma.amazonDailySales.findFirst({
    orderBy: { uploadedAt: "desc" },
    select: { uploadedAt: true },
  });

  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const totalUnits = rows.reduce((a, r) => a + r.units, 0);
  const yoyRevenue = rows.reduce((a, r) => a + (r.yoyRevenue ?? 0), 0);
  const yoyUnits = rows.reduce((a, r) => a + (r.yoyUnits ?? 0), 0);

  return NextResponse.json({
    window: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    totals: {
      revenue: totalRevenue,
      units: totalUnits,
      yoyRevenue,
      yoyUnits,
      yoyRevenuePct: yoyRevenue > 0 ? ((totalRevenue - yoyRevenue) / yoyRevenue) * 100 : null,
      yoyUnitsPct: yoyUnits > 0 ? ((totalUnits - yoyUnits) / yoyUnits) * 100 : null,
      avgOrderValue: totalUnits > 0 ? totalRevenue / totalUnits : 0,
    },
    daily: rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      revenue: r.revenue,
      units: r.units,
      yoyRevenue: r.yoyRevenue,
      yoyUnits: r.yoyUnits,
    })),
    meta: {
      lastUploadedAt: latest?.uploadedAt ?? null,
      daysWithData: rows.length,
    },
  });
}
