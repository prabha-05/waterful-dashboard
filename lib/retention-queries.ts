import { prisma } from "./db";

export async function getRetentionMetrics() {
  const allOrders = await prisma.salesOrder.findMany({
    where: { duplicate: 1 },
    select: {
      orderId: true,
      customerName: true,
      date: true,
      total: true,
    },
    orderBy: { date: "asc" },
  });

  // Group orders by customer
  const customerOrders = new Map<string, { date: Date; orderId: number }[]>();
  for (const o of allOrders) {
    const name = o.customerName.trim();
    if (!customerOrders.has(name)) customerOrders.set(name, []);
    customerOrders.get(name)!.push({ date: o.date, orderId: o.orderId });
  }

  const totalCustomers = customerOrders.size;
  const repeatCustomers = Array.from(customerOrders.values()).filter((orders) => orders.length > 1).length;
  const retentionRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
  const churnRate = 100 - retentionRate;

  // Average time between orders (for repeat customers)
  let totalDaysBetween = 0;
  let gapCount = 0;
  for (const orders of customerOrders.values()) {
    if (orders.length < 2) continue;
    const sorted = orders.sort((a, b) => a.date.getTime() - b.date.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const days = (sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / (1000 * 60 * 60 * 24);
      totalDaysBetween += days;
      gapCount++;
    }
  }
  const avgDaysBetweenOrders = gapCount > 0 ? Math.round(totalDaysBetween / gapCount) : 0;

  // Cohort retention: group customers by first purchase month
  const cohorts = new Map<string, Map<string, Set<string>>>();
  for (const [name, orders] of customerOrders.entries()) {
    const sorted = orders.sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstDate = sorted[0].date;
    const cohortKey = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, "0")}`;

    if (!cohorts.has(cohortKey)) cohorts.set(cohortKey, new Map());
    const cohort = cohorts.get(cohortKey)!;

    for (const order of sorted) {
      const orderMonth = `${order.date.getFullYear()}-${String(order.date.getMonth() + 1).padStart(2, "0")}`;
      if (!cohort.has(orderMonth)) cohort.set(orderMonth, new Set());
      cohort.get(orderMonth)!.add(name);
    }
  }

  // Build cohort table (show last 12 cohorts, months 0-6)
  const sortedCohortKeys = Array.from(cohorts.keys()).sort().slice(-12);
  const cohortTable = sortedCohortKeys.map((cohortKey) => {
    const cohort = cohorts.get(cohortKey)!;
    const cohortCustomers = cohort.get(cohortKey)?.size || 0;

    // Calculate retention for months 0-6
    const [year, month] = cohortKey.split("-").map(Number);
    function pct(i: number) {
      const targetDate = new Date(year, month - 1 + i);
      const targetKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;
      const activeCustomers = cohort.get(targetKey)?.size || 0;
      return cohortCustomers > 0 ? Math.round((activeCustomers / cohortCustomers) * 100) : 0;
    }

    return {
      cohort: cohortKey,
      customers: cohortCustomers,
      M0: pct(0),
      M1: pct(1),
      M2: pct(2),
      M3: pct(3),
      M4: pct(4),
      M5: pct(5),
      M6: pct(6),
    };
  });

  // New vs Returning customers by month
  const firstPurchaseMonth = new Map<string, string>();
  for (const [name, orders] of customerOrders.entries()) {
    const sorted = orders.sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstMonth = `${sorted[0].date.getFullYear()}-${String(sorted[0].date.getMonth() + 1).padStart(2, "0")}`;
    firstPurchaseMonth.set(name, firstMonth);
  }

  const monthlyNewReturning = new Map<string, { new: number; returning: number }>();
  for (const o of allOrders) {
    const orderMonth = `${o.date.getFullYear()}-${String(o.date.getMonth() + 1).padStart(2, "0")}`;
    const name = o.customerName.trim();
    if (!monthlyNewReturning.has(orderMonth)) monthlyNewReturning.set(orderMonth, { new: 0, returning: 0 });

    const entry = monthlyNewReturning.get(orderMonth)!;
    if (firstPurchaseMonth.get(name) === orderMonth) {
      entry.new++;
    } else {
      entry.returning++;
    }
  }

  const newVsReturning = Array.from(monthlyNewReturning.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, new: data.new, returning: data.returning }));

  return {
    totalCustomers,
    repeatCustomers,
    retentionRate: Math.round(retentionRate * 10) / 10,
    churnRate: Math.round(churnRate * 10) / 10,
    avgDaysBetweenOrders,
    cohortTable,
    newVsReturning,
  };
}

export async function getCustomerLifetimeMetrics() {
  const allOrders = await prisma.salesOrder.findMany({
    where: { duplicate: 1 },
    select: {
      orderId: true,
      customerName: true,
      date: true,
      total: true,
    },
  });

  // Customer stats
  const customerData = new Map<string, { orderCount: number; totalSpend: number; dates: Date[] }>();
  for (const o of allOrders) {
    const name = o.customerName.trim();
    if (!customerData.has(name)) customerData.set(name, { orderCount: 0, totalSpend: 0, dates: [] });
    const c = customerData.get(name)!;
    c.orderCount++;
    c.totalSpend += o.total;
    c.dates.push(o.date);
  }

  // Average CLV
  const totalCustomers = customerData.size;
  const totalSpendAll = Array.from(customerData.values()).reduce((sum, c) => sum + c.totalSpend, 0);
  const avgCLV = totalCustomers > 0 ? Math.round(totalSpendAll / totalCustomers) : 0;

  // Repeat purchase frequency (avg orders for repeat customers)
  const repeatCustomerOrders: number[] = [];
  for (const c of customerData.values()) {
    if (c.orderCount > 1) repeatCustomerOrders.push(c.orderCount);
  }
  const avgRepeatFrequency = repeatCustomerOrders.length > 0
    ? Math.round((repeatCustomerOrders.reduce((a, b) => a + b, 0) / repeatCustomerOrders.length) * 10) / 10
    : 0;

  // Top 10 loyal customers
  const topLoyal = Array.from(customerData.entries())
    .map(([name, c]) => ({
      name,
      orders: c.orderCount,
      totalSpend: Math.round(c.totalSpend),
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 10);

  // CLV distribution buckets
  const clvBuckets = [
    { label: "₹0-500", min: 0, max: 500, count: 0 },
    { label: "₹500-1K", min: 500, max: 1000, count: 0 },
    { label: "₹1K-2K", min: 1000, max: 2000, count: 0 },
    { label: "₹2K-5K", min: 2000, max: 5000, count: 0 },
    { label: "₹5K-10K", min: 5000, max: 10000, count: 0 },
    { label: "₹10K+", min: 10000, max: Infinity, count: 0 },
  ];
  for (const c of customerData.values()) {
    for (const bucket of clvBuckets) {
      if (c.totalSpend >= bucket.min && c.totalSpend < bucket.max) {
        bucket.count++;
        break;
      }
    }
  }
  const clvDistribution = clvBuckets.map((b) => ({ label: b.label, count: b.count }));

  // Repeat frequency distribution
  const freqBuckets = [
    { label: "1 order", min: 1, max: 2, count: 0 },
    { label: "2 orders", min: 2, max: 3, count: 0 },
    { label: "3-5 orders", min: 3, max: 6, count: 0 },
    { label: "6-10 orders", min: 6, max: 11, count: 0 },
    { label: "11+ orders", min: 11, max: Infinity, count: 0 },
  ];
  for (const c of customerData.values()) {
    for (const bucket of freqBuckets) {
      if (c.orderCount >= bucket.min && c.orderCount < bucket.max) {
        bucket.count++;
        break;
      }
    }
  }
  const frequencyDistribution = freqBuckets.map((b) => ({ label: b.label, count: b.count }));

  return {
    avgCLV,
    avgRepeatFrequency,
    topLoyal,
    clvDistribution,
    frequencyDistribution,
  };
}
