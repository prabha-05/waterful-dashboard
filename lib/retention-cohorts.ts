import { prisma } from "./db";

export type CohortMetrics = {
  cohortWeek: string; // Monday date YYYY-MM-DD
  cohortLabel: string; // e.g. "4 Aug 2025"
  ftOrders: number;
  ftCustomers: number;
  ftRevenue: number;
  ftAov: number;
  repeatOrders: number;
  repeatCustomers: number;
  repeatRevenue: number;
  repeatAov: number;
  repeatPct: number; // 0-100
  repeatFrequency: number;
  totalAov: number;
  dropOff: number;
  arpu: number;
  arpuExpansion: number;
  ltv: number;
  ltvExpansion: number;
};

export type ProductCohortMetrics = CohortMetrics & {
  product: string;
};

function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatWeekLabel(monday: Date): string {
  return monday.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function finalize(
  mobiles: Set<string>,
  weekStart: Date,
  weekEnd: Date,
  orders: { mobile: string; date: Date; total: number }[],
): Omit<CohortMetrics, "cohortWeek" | "cohortLabel"> {
  let ftOrders = 0;
  let ftRevenue = 0;
  let repeatOrders = 0;
  let repeatRevenue = 0;
  const repeatMobiles = new Set<string>();

  for (const o of orders) {
    if (!mobiles.has(o.mobile)) continue;
    if (o.date >= weekStart && o.date < weekEnd) {
      ftOrders++;
      ftRevenue += o.total;
    } else if (o.date >= weekEnd) {
      repeatOrders++;
      repeatRevenue += o.total;
      repeatMobiles.add(o.mobile);
    }
  }

  const ftCustomers = mobiles.size;
  const repeatCustomers = repeatMobiles.size;
  const ftAov = ftOrders > 0 ? ftRevenue / ftOrders : 0;
  const repeatAov = repeatOrders > 0 ? repeatRevenue / repeatOrders : 0;
  const totalOrders = ftOrders + repeatOrders;
  const totalRevenue = ftRevenue + repeatRevenue;
  const totalAov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const repeatPct = ftCustomers > 0 ? (repeatCustomers / ftCustomers) * 100 : 0;
  const repeatFrequency = repeatCustomers > 0 ? repeatOrders / repeatCustomers : 0;
  const dropOff = ftCustomers - repeatCustomers;
  const arpu = ftCustomers > 0 ? totalRevenue / ftCustomers : 0;
  const arpuExpansion = ftAov > 0 ? arpu / ftAov : 0;
  const ltv = arpu;
  const ltvExpansion = arpuExpansion;

  return {
    ftOrders,
    ftCustomers,
    ftRevenue: Math.round(ftRevenue),
    ftAov: Math.round(ftAov),
    repeatOrders,
    repeatCustomers,
    repeatRevenue: Math.round(repeatRevenue),
    repeatAov: Math.round(repeatAov),
    repeatPct: Math.round(repeatPct * 10) / 10,
    repeatFrequency: Math.round(repeatFrequency * 100) / 100,
    totalAov: Math.round(totalAov),
    dropOff,
    arpu: Math.round(arpu),
    arpuExpansion: Math.round(arpuExpansion * 100) / 100,
    ltv: Math.round(ltv),
    ltvExpansion: Math.round(ltvExpansion * 100) / 100,
  };
}

export async function computeCohorts(
  startDate: Date,
  endDate: Date,
): Promise<{ cohorts: CohortMetrics[]; productCohorts: ProductCohortMetrics[] }> {
  // 1. Earliest order per mobile across ALL history
  const firstOrders = await prisma.salesOrder.groupBy({
    by: ["mobile"],
    _min: { date: true },
    where: { mobile: { not: "" }, duplicate: 1 },
  });

  // 2. Cohort mobiles: those whose first-ever order falls in [startDate, endDate)
  const cohortMap = new Map<string, Set<string>>(); // weekKey -> mobiles
  for (const r of firstOrders) {
    if (!r.mobile || !r._min.date) continue;
    const d = r._min.date;
    if (d < startDate || d >= endDate) continue;
    const monday = mondayOf(d);
    const key = dateKey(monday);
    if (!cohortMap.has(key)) cohortMap.set(key, new Set());
    cohortMap.get(key)!.add(r.mobile);
  }

  if (cohortMap.size === 0) return { cohorts: [], productCohorts: [] };

  const allMobiles = Array.from(new Set([...cohortMap.values()].flatMap((s) => [...s])));

  // 3. Fetch ALL orders (ever) for cohort customers — need to include post-period orders for repeat
  const allOrders = await prisma.salesOrder.findMany({
    where: { mobile: { in: allMobiles }, duplicate: 1 },
    select: { mobile: true, date: true, total: true, flavour: true },
  });

  // 4. Per-cohort aggregation
  const cohorts: CohortMetrics[] = [];
  for (const [weekKey, mobiles] of cohortMap) {
    const [y, m, d] = weekKey.split("-").map(Number);
    const weekStart = new Date(y, m - 1, d);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const base = finalize(mobiles, weekStart, weekEnd, allOrders);
    cohorts.push({
      cohortWeek: weekKey,
      cohortLabel: formatWeekLabel(weekStart),
      ...base,
    });
  }

  // 5. Product × cohort: determine each mobile's "acquisition product" (flavour of their first order)
  //    then aggregate metrics using only orders of that flavour for that mobile.
  const mobileAcqProduct = new Map<string, string>();
  // Walk allOrders sorted by date ascending per mobile
  const byMobile = new Map<string, { date: Date; flavour: string }[]>();
  for (const o of allOrders) {
    const arr = byMobile.get(o.mobile) || [];
    arr.push({ date: o.date, flavour: o.flavour });
    byMobile.set(o.mobile, arr);
  }
  for (const [mobile, arr] of byMobile) {
    arr.sort((a, b) => a.date.getTime() - b.date.getTime());
    if (arr[0]) mobileAcqProduct.set(mobile, arr[0].flavour || "Unknown");
  }

  // Group cohort mobiles by (week, product)
  const productCohortMobiles = new Map<string, Set<string>>(); // key = week|product -> mobiles
  for (const [weekKey, mobiles] of cohortMap) {
    for (const mob of mobiles) {
      const prod = mobileAcqProduct.get(mob) || "Unknown";
      const k = `${weekKey}|${prod}`;
      if (!productCohortMobiles.has(k)) productCohortMobiles.set(k, new Set());
      productCohortMobiles.get(k)!.add(mob);
    }
  }

  const productCohorts: ProductCohortMetrics[] = [];
  for (const [key, mobiles] of productCohortMobiles) {
    const [weekKey, product] = key.split("|");
    const [y, m, d] = weekKey.split("-").map(Number);
    const weekStart = new Date(y, m - 1, d);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Only orders of this product from these mobiles contribute
    const scopedOrders = allOrders.filter(
      (o) => mobiles.has(o.mobile) && (o.flavour || "Unknown") === product,
    );
    const base = finalize(mobiles, weekStart, weekEnd, scopedOrders);
    productCohorts.push({
      cohortWeek: weekKey,
      cohortLabel: formatWeekLabel(weekStart),
      product,
      ...base,
    });
  }

  cohorts.sort((a, b) => a.cohortWeek.localeCompare(b.cohortWeek));
  productCohorts.sort(
    (a, b) =>
      a.cohortWeek.localeCompare(b.cohortWeek) || b.ftCustomers - a.ftCustomers,
  );

  return { cohorts, productCohorts };
}
