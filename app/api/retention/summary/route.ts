import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const orders = await prisma.salesOrder.findMany({
    where: { duplicate: 1, mobile: { not: "" } },
    select: { mobile: true, total: true, date: true },
    orderBy: { date: "asc" },
  });

  // Aggregate per-customer: order count + chronologically ordered totals
  const byMobile = new Map<string, { count: number; totals: number[] }>();
  for (const o of orders) {
    if (!o.date) continue;
    const entry = byMobile.get(o.mobile);
    if (entry) {
      entry.count++;
      entry.totals.push(o.total);
    } else {
      byMobile.set(o.mobile, { count: 1, totals: [o.total] });
    }
  }

  let totalCustomers = 0;
  let cameBack = 0;
  let extraOrdersSum = 0;
  let totalOrders = 0;
  let totalRevenue = 0;

  for (const entry of byMobile.values()) {
    totalCustomers++;
    totalOrders += entry.count;
    for (const t of entry.totals) totalRevenue += t;
    if (entry.count >= 2) {
      cameBack++;
      extraOrdersSum += entry.count - 1;
    }
  }

  const droppedOff = totalCustomers - cameBack;
  // Retention Rate = 2nd-purchase customers ÷ 1st-purchase customers
  const retentionRateDecimal = totalCustomers > 0 ? cameBack / totalCustomers : 0;
  const retentionRate = retentionRateDecimal * 100;
  // Repeat Order Frequency = Total Repeat Orders ÷ Total Repeat Customers
  const repeatFrequency = cameBack > 0 ? extraOrdersSum / cameBack : 0;
  // Total AOV = Total Revenue ÷ Total Orders
  const totalAov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  // ARPU = Total Revenue ÷ Total Customers
  const arpu = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
  // ARPU Expansion = AOV × Retention Rate × Repeat Frequency
  const arpuExpansion = totalAov * retentionRateDecimal * repeatFrequency;
  // LTV = AOV × Total Orders per Customer
  const ordersPerCustomer = totalCustomers > 0 ? totalOrders / totalCustomers : 0;
  const ltv = totalAov * ordersPerCustomer;
  // LTV Expansion = AOV × [1 + (Retention Rate × Repeat Frequency)]
  const ltvExpansion = totalAov * (1 + retentionRateDecimal * repeatFrequency);

  return NextResponse.json({
    totalCustomers,
    cameBack,
    droppedOff,
    retentionRate,
    repeatFrequency,
    totalAov,
    arpu,
    arpuExpansion,
    ltv,
    ltvExpansion,
  });
}
