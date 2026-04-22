import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type OrderRec = { date: Date; total: number; flavour: string; state: string };
type CustomerRec = {
  orders: OrderRec[];
  firstDate: Date;
  firstFlavour: string;
  firstState: string;
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

const MS_PER_DAY = 86400000;
const CHURN_THRESHOLD_DAYS = 90;
const MAX_COHORT_OFFSET = 12;

export async function GET() {
  const orders = await prisma.salesOrder.findMany({
    where: { duplicate: 1, mobile: { not: "" } },
    select: { mobile: true, total: true, date: true, flavour: true, billingState: true },
    orderBy: { date: "asc" },
  });

  // Per-customer aggregation (orders already sorted asc by date)
  const byMobile = new Map<string, CustomerRec>();
  for (const o of orders) {
    if (!o.date) continue;
    let entry = byMobile.get(o.mobile);
    if (!entry) {
      entry = {
        orders: [],
        firstDate: o.date,
        firstFlavour: o.flavour || "Unknown",
        firstState: o.billingState || "Unknown",
      };
      byMobile.set(o.mobile, entry);
    }
    entry.orders.push({
      date: o.date,
      total: o.total,
      flavour: o.flavour || "Unknown",
      state: o.billingState || "Unknown",
    });
  }

  const now = new Date();
  const nowMs = now.getTime();

  // ─── 1. Cohort retention matrix ──────────────────────────────────
  const cohorts = new Map<string, { size: number; offsetsCust: Map<number, Set<string>> }>();
  for (const [mobile, entry] of byMobile.entries()) {
    const cKey = monthKey(entry.firstDate);
    let c = cohorts.get(cKey);
    if (!c) {
      c = { size: 0, offsetsCust: new Map() };
      cohorts.set(cKey, c);
    }
    c.size++;
    for (const o of entry.orders) {
      const offset =
        (o.date.getFullYear() - entry.firstDate.getFullYear()) * 12 +
        (o.date.getMonth() - entry.firstDate.getMonth());
      if (offset > MAX_COHORT_OFFSET) continue;
      if (!c.offsetsCust.has(offset)) c.offsetsCust.set(offset, new Set());
      c.offsetsCust.get(offset)!.add(mobile);
    }
  }

  const cohortKeys = Array.from(cohorts.keys()).sort();
  const cohortMatrix = cohortKeys.map((key) => {
    const c = cohorts.get(key)!;
    const [y, m] = key.split("-").map(Number);
    const monthsSince =
      (now.getFullYear() - y) * 12 + (now.getMonth() - (m - 1));
    const reachable = Math.min(monthsSince, MAX_COHORT_OFFSET);
    const months: { offset: number; count: number; pct: number }[] = [];
    for (let i = 0; i <= reachable; i++) {
      const count = c.offsetsCust.get(i)?.size ?? 0;
      months.push({ offset: i, count, pct: c.size > 0 ? (count / c.size) * 100 : 0 });
    }
    return { cohort: key, label: monthLabel(key), size: c.size, months };
  });

  // ─── 2. Current churn snapshot ───────────────────────────────────
  let churned = 0;
  let totalCount = 0;
  for (const entry of byMobile.values()) {
    totalCount++;
    const last = entry.orders[entry.orders.length - 1].date;
    const daysSince = (nowMs - last.getTime()) / MS_PER_DAY;
    if (daysSince > CHURN_THRESHOLD_DAYS) churned++;
  }
  const churnRate = totalCount > 0 ? (churned / totalCount) * 100 : 0;

  // ─── 3. Monthly retention/churn trend (last 12 months) ───────────
  const lastMonths: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    lastMonths.push(monthKey(d));
  }
  const monthlyActive = new Map<string, Set<string>>();
  for (const [mobile, entry] of byMobile.entries()) {
    for (const o of entry.orders) {
      const key = monthKey(o.date);
      if (!monthlyActive.has(key)) monthlyActive.set(key, new Set());
      monthlyActive.get(key)!.add(mobile);
    }
  }
  const churnTrend = lastMonths.map((key, idx) => {
    const currSet = monthlyActive.get(key) ?? new Set();
    if (idx === 0) {
      return { month: key, label: monthLabel(key), active: currSet.size, retention: 0, churn: 0 };
    }
    const prevSet = monthlyActive.get(lastMonths[idx - 1]) ?? new Set();
    let retained = 0;
    for (const m of prevSet) if (currSet.has(m)) retained++;
    const retention = prevSet.size > 0 ? (retained / prevSet.size) * 100 : 0;
    return {
      month: key,
      label: monthLabel(key),
      active: currSet.size,
      retention,
      churn: 100 - retention,
    };
  });

  // ─── 4. Win-back rate (monthly) ──────────────────────────────────
  const winBackMonthly = lastMonths.map((key) => {
    const [y, m] = key.split("-").map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 1);
    let dormantBase = 0;
    let wonBack = 0;
    for (const entry of byMobile.values()) {
      const before: OrderRec[] = [];
      for (const o of entry.orders) if (o.date < monthStart) before.push(o);
      if (before.length === 0) continue;
      const lastBefore = before[before.length - 1].date;
      const daysSilent = (monthStart.getTime() - lastBefore.getTime()) / MS_PER_DAY;
      if (daysSilent >= CHURN_THRESHOLD_DAYS) {
        dormantBase++;
        const inMonth = entry.orders.some((o) => o.date >= monthStart && o.date < monthEnd);
        if (inMonth) wonBack++;
      }
    }
    return {
      month: key,
      label: monthLabel(key),
      dormantBase,
      wonBack,
      rate: dormantBase > 0 ? (wonBack / dormantBase) * 100 : 0,
    };
  });

  // ─── 5. Time to 2nd order (distribution + median) ────────────────
  const timeTo2ndBuckets = [
    { label: "0–14 d", min: 0, max: 14, count: 0 },
    { label: "15–30 d", min: 15, max: 30, count: 0 },
    { label: "31–60 d", min: 31, max: 60, count: 0 },
    { label: "61–90 d", min: 61, max: 90, count: 0 },
    { label: "91–180 d", min: 91, max: 180, count: 0 },
    { label: "180+ d", min: 181, max: Infinity, count: 0 },
  ];
  const daysTo2nd: number[] = [];
  for (const entry of byMobile.values()) {
    if (entry.orders.length < 2) continue;
    const d = (entry.orders[1].date.getTime() - entry.orders[0].date.getTime()) / MS_PER_DAY;
    daysTo2nd.push(d);
    for (const b of timeTo2ndBuckets) {
      if (d >= b.min && d <= b.max) {
        b.count++;
        break;
      }
    }
  }
  daysTo2nd.sort((a, b) => a - b);
  const timeTo2ndMedian = daysTo2nd.length > 0 ? daysTo2nd[Math.floor(daysTo2nd.length / 2)] : 0;

  // ─── 6. Replenishment cycle (days between consecutive orders) ────
  const replenBuckets = [
    { label: "0–14 d", min: 0, max: 14, count: 0 },
    { label: "15–30 d", min: 15, max: 30, count: 0 },
    { label: "31–60 d", min: 31, max: 60, count: 0 },
    { label: "61–90 d", min: 61, max: 90, count: 0 },
    { label: "90+ d", min: 91, max: Infinity, count: 0 },
  ];
  const replenDays: number[] = [];
  for (const entry of byMobile.values()) {
    for (let i = 1; i < entry.orders.length; i++) {
      const d = (entry.orders[i].date.getTime() - entry.orders[i - 1].date.getTime()) / MS_PER_DAY;
      replenDays.push(d);
      for (const b of replenBuckets) {
        if (d >= b.min && d <= b.max) {
          b.count++;
          break;
        }
      }
    }
  }
  replenDays.sort((a, b) => a - b);
  const replenMedian = replenDays.length > 0 ? replenDays[Math.floor(replenDays.length / 2)] : 0;

  // ─── 7. Retention by flavour (first-purchase product) ────────────
  const flavourStats = new Map<string, { total: number; repeat: number }>();
  for (const entry of byMobile.values()) {
    const key = entry.firstFlavour;
    let s = flavourStats.get(key);
    if (!s) {
      s = { total: 0, repeat: 0 };
      flavourStats.set(key, s);
    }
    s.total++;
    if (entry.orders.length >= 2) s.repeat++;
  }
  const byFlavour = Array.from(flavourStats.entries())
    .map(([flavour, s]) => ({
      flavour,
      total: s.total,
      repeat: s.repeat,
      rate: s.total > 0 ? (s.repeat / s.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // ─── 8. Retention by state (first-order state) ───────────────────
  const stateStats = new Map<string, { total: number; repeat: number }>();
  for (const entry of byMobile.values()) {
    const key = entry.firstState;
    let s = stateStats.get(key);
    if (!s) {
      s = { total: 0, repeat: 0 };
      stateStats.set(key, s);
    }
    s.total++;
    if (entry.orders.length >= 2) s.repeat++;
  }
  const byState = Array.from(stateStats.entries())
    .map(([state, s]) => ({
      state,
      total: s.total,
      repeat: s.repeat,
      rate: s.total > 0 ? (s.repeat / s.total) * 100 : 0,
    }))
    .filter((r) => r.total >= 5) // hide noise from tiny states
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  return NextResponse.json({
    totalCustomers: totalCount,
    churnRate,
    churnThresholdDays: CHURN_THRESHOLD_DAYS,
    churnTrend,
    winBackMonthly,
    timeTo2ndBuckets,
    timeTo2ndMedian,
    replenBuckets,
    replenMedian,
    byFlavour,
    byState,
    cohortMatrix,
    maxCohortOffset: MAX_COHORT_OFFSET,
  });
}
