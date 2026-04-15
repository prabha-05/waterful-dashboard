import { prisma } from "./db";

export type MonthlyCohortRow = {
  cohortMonth: string; // YYYY-MM
  cohortLabel: string; // e.g. "Jan 2025"
  size: number;
  rates: (number | null)[]; // length 7: [M0, M1, ..., M6]; null = not yet matured
  counts: (number | null)[]; // matching customer counts per bucket
};

const MONTH_OFFSETS = 7; // M0..M6

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKey(d);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export async function computeMonthlyRetention(
  startDate: Date,
  endDate: Date,
): Promise<MonthlyCohortRow[]> {
  const firstOrders = await prisma.salesOrder.groupBy({
    by: ["mobile"],
    _min: { date: true },
    where: { mobile: { not: "" }, duplicate: 1 },
  });

  // Map: cohortMonth -> Set of mobiles
  const cohortMap = new Map<string, Set<string>>();
  for (const r of firstOrders) {
    const d = r._min.date;
    if (!r.mobile || !d) continue;
    if (d < startDate || d >= endDate) continue;
    const mk = monthKey(d);
    if (!cohortMap.has(mk)) cohortMap.set(mk, new Set());
    cohortMap.get(mk)!.add(r.mobile);
  }

  if (cohortMap.size === 0) return [];

  const allMobiles = Array.from(new Set([...cohortMap.values()].flatMap((s) => [...s])));

  const allOrders = await prisma.salesOrder.findMany({
    where: { mobile: { in: allMobiles }, duplicate: 1 },
    select: { mobile: true, date: true },
  });

  // mobile -> Set of months they ordered in
  const mobileMonths = new Map<string, Set<string>>();
  for (const o of allOrders) {
    const mk = monthKey(o.date);
    const s = mobileMonths.get(o.mobile) || new Set<string>();
    s.add(mk);
    mobileMonths.set(o.mobile, s);
  }

  const todayKey = monthKey(new Date());

  const rows: MonthlyCohortRow[] = [];
  for (const [cohortMonth, mobiles] of cohortMap) {
    const size = mobiles.size;
    const rates: (number | null)[] = [];
    const counts: (number | null)[] = [];
    for (let offset = 0; offset < MONTH_OFFSETS; offset++) {
      const targetMonth = addMonths(cohortMonth, offset);
      // Not yet matured: targetMonth is after current month
      if (targetMonth > todayKey) {
        rates.push(null);
        counts.push(null);
        continue;
      }
      let count = 0;
      for (const mob of mobiles) {
        const ms = mobileMonths.get(mob);
        if (ms && ms.has(targetMonth)) count++;
      }
      counts.push(count);
      rates.push(size > 0 ? (count / size) * 100 : 0);
    }
    rows.push({
      cohortMonth,
      cohortLabel: monthLabel(cohortMonth),
      size,
      rates,
      counts,
    });
  }

  rows.sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth));
  return rows;
}
