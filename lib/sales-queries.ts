import { prisma } from "./db";

export async function getRevenueAndOrderMetrics() {
  const allOrders = await prisma.salesOrder.findMany({
    select: {
      orderId: true,
      total: true,
      status: true,
      month: true,
      date: true,
      duplicate: true,
    },
  });

  // Primary rows (duplicate=1) = one row per unique order line
  const primaryRows = allOrders.filter((o) => o.duplicate === 1);
  const totalOrders = primaryRows.length;
  const totalRevenue = primaryRows.reduce((sum, o) => sum + o.total, 0);

  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Status breakdown from all rows
  const statusCounts: Record<string, number> = {};
  for (const o of allOrders) {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  }

  // RTO + Cancel rate
  const totalLineItems = allOrders.length;
  const rtoCancel =
    (statusCounts["RTO"] || 0) +
    (statusCounts["Cancelled"] || 0) +
    (statusCounts["RTO In Transit"] || 0);
  const rtoCancelRate = totalLineItems > 0 ? (rtoCancel / totalLineItems) * 100 : 0;

  // Monthly revenue trend
  const monthlyMap = new Map<string, number>();
  for (const o of primaryRows) {
    const key = `${o.date.getFullYear()}-${String(o.date.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + o.total);
  }
  const monthlyRevenue = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue: Math.round(revenue) }));

  const statusData = Object.entries(statusCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([status, count]) => ({ status, count }));

  return {
    totalRevenue: Math.round(totalRevenue),
    totalOrders,
    aov: Math.round(aov),
    rtoCancelRate: Math.round(rtoCancelRate * 10) / 10,
    monthlyRevenue,
    statusData,
  };
}

export async function getCustomerAndProductMetrics() {
  const allOrders = await prisma.salesOrder.findMany({
    select: {
      orderId: true,
      total: true,
      flavour: true,
      customerName: true,
      billingState: true,
      billingCity: true,
      duplicate: true,
      qty: true,
    },
  });

  const primaryRows = allOrders.filter((o) => o.duplicate === 1);

  // Top 10 products by revenue
  const productRevMap = new Map<string, number>();
  for (const o of primaryRows) {
    productRevMap.set(o.flavour, (productRevMap.get(o.flavour) || 0) + o.total);
  }
  const topProducts = Array.from(productRevMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([product, revenue]) => ({
      product: product.length > 25 ? product.slice(0, 25) + "\u2026" : product,
      revenue: Math.round(revenue),
    }));

  // Top 10 states by revenue
  const stateRevMap = new Map<string, number>();
  for (const o of primaryRows) {
    stateRevMap.set(o.billingState, (stateRevMap.get(o.billingState) || 0) + o.total);
  }
  const topStates = Array.from(stateRevMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([state, revenue]) => ({ state, revenue: Math.round(revenue) }));

  // Top 10 cities by revenue
  const cityRevMap = new Map<string, number>();
  for (const o of primaryRows) {
    const city = o.billingCity.charAt(0).toUpperCase() + o.billingCity.slice(1).toLowerCase();
    cityRevMap.set(city, (cityRevMap.get(city) || 0) + o.total);
  }
  const topCities = Array.from(cityRevMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([city, revenue]) => ({ city, revenue: Math.round(revenue) }));

  // Repeat customers — count by number of primary rows per customer
  const customerOrderCount = new Map<string, number>();
  const customerSpendMap = new Map<string, number>();
  for (const o of primaryRows) {
    const name = o.customerName.trim();
    customerOrderCount.set(name, (customerOrderCount.get(name) || 0) + 1);
    customerSpendMap.set(name, (customerSpendMap.get(name) || 0) + o.total);
  }

  const totalCustomers = customerOrderCount.size;
  const repeatCustomers = Array.from(customerOrderCount.entries()).filter(
    ([, count]) => count > 1
  );
  const repeatRate =
    totalCustomers > 0 ? (repeatCustomers.length / totalCustomers) * 100 : 0;

  const topCustomers = repeatCustomers
    .map(([name, count]) => ({
      name,
      orders: count,
      totalSpend: Math.round(customerSpendMap.get(name) || 0),
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 10);

  return {
    totalCustomers,
    repeatRate: Math.round(repeatRate * 10) / 10,
    topProducts,
    topStates,
    topCities,
    topCustomers,
  };
}
