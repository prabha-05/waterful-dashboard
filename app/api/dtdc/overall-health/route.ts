import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Powers the DTDC Overall Health page. Returns two sections:
//
//   Section 1 — Network performance (unfiltered, full dataset):
//     • City breakdown table (Closed / Delivered / RTO / Failed / Delivery rate)
//     • Worst delivery rate by city (min 5 closed, tier-coloured)
//     • Top cities by shipment volume
//     • Delivery time histogram (1d, 2d, …, 8+d)
//     • RTO / failure reasons
//
//   Section 2 — Partnership health (filtered: from / to / city):
//     • Status distribution across 13 detailed buckets, grouped by family
//       (Delivered / In pipeline / Failed / RTO progress / RTO complete)

const NDR_REASON_BUCKETS: { id: string; label: string; match: RegExp }[] = [
  { id: "receiverUnreachable", label: "Receiver unreachable", match: /\bPNA\b|not\s*reachable/i },
  { id: "addressProblem",      label: "Address problem",       match: /\bADR\b|address\s*(incomplete|wrong|not\s*found)/i },
  { id: "nonServiceableArea",  label: "Non-serviceable area",  match: /\bNSR\b|non[\s-]*service|area\s*non/i },
  { id: "receiverRefused",     label: "Receiver refused",      match: /\bKYC\b|\bREF\b|refuse/i },
  { id: "couldNotAttempt",     label: "Could not attempt",     match: /\bUAT\b|could\s*not\s*attempt/i },
  { id: "officeClosed",        label: "Office closed",         match: /\bDLK\b|door\s*lock|office\s*closed/i },
];

const FAILURE_REMARK_PATTERN = /^[A-Z]{3}\|/;

type Family = "delivered" | "pipeline" | "failed" | "rtoProgress" | "rtoComplete";
type DetailedStatus = { label: string; family: Family };

function detailedStatus(rawStatus: string | null): DetailedStatus {
  const s = (rawStatus || "").toLowerCase().trim();
  if (s === "delivered") return { label: "Delivered", family: "delivered" };
  if (s === "rto delivered") return { label: "RTO received back", family: "rtoComplete" };
  if (s === "rto non-delivered" || s === "rto not delivered") return { label: "RTO non-delivered", family: "failed" };
  if (/waiting for rto approval/.test(s)) return { label: "RTO approval awaited", family: "rtoProgress" };
  if (/^(set rto initiated|rto initiated)$/.test(s)) return { label: "RTO initiated", family: "rtoProgress" };
  if (/rto approved/.test(s)) return { label: "RTO approved", family: "rtoProgress" };
  if (/rto.*transit/.test(s)) return { label: "RTO in transit", family: "rtoProgress" };
  if (/reattempt/.test(s)) return { label: "Reattempt initiated", family: "rtoProgress" };
  if (s === "not delivered" || /weekly off|mis route/.test(s)) return { label: "Not delivered", family: "failed" };
  if (s === "out for delivery" || s === "ofd") return { label: "Out for delivery", family: "pipeline" };
  if (/in transit|reached|received at/.test(s)) return { label: "En route", family: "pipeline" };
  if (/pickup|softdata/.test(s)) return { label: "Prepared", family: "pipeline" };
  return { label: "Booked", family: "pipeline" };
}

// Closed = parcel has reached a terminal state. Used for the city table.
type Terminal = "delivered" | "rto" | "failed" | null;
function terminalState(rawStatus: string | null): Terminal {
  const s = (rawStatus || "").toLowerCase().trim();
  if (s === "delivered") return "delivered";
  if (s === "rto delivered") return "rto";
  if (s === "not delivered" || s === "rto non-delivered" || s === "rto not delivered") return "failed";
  return null;
}

function transitDays(booked: Date | null, statusAt: Date | null): number | null {
  if (!booked || !statusAt) return null;
  const ms = statusAt.getTime() - booked.getTime();
  if (ms < 0) return null;
  return ms / 86_400_000;
}

export async function GET(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const cityParam = req.nextUrl.searchParams.get("city")?.trim().toUpperCase() || null;

  const fromDate = fromParam ? new Date(fromParam) : null;
  const toDate = toParam ? new Date(toParam) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  // Date range applies to the entire page. City filter is scoped to
  // the partnership status distribution only — applying it to the
  // city-level breakdowns would collapse them to a single row.
  const everyShipment = await prisma.dtdcShipment.findMany({
    select: {
      id: true,
      status: true,
      statusAt: true,
      bookedAt: true,
      destination: true,
      lastRemarks: true,
      noOfAttempts: true,
    },
  });
  const all = everyShipment.filter((s) => {
    if (fromDate && (!s.bookedAt || s.bookedAt < fromDate)) return false;
    if (toDate && (!s.bookedAt || s.bookedAt > toDate)) return false;
    return true;
  });

  // ─── City breakdown ────────────────────────────────────────────
  const cityMap = new Map<string, { delivered: number; rto: number; failed: number; total: number }>();
  for (const s of all) {
    const city = s.destination?.toUpperCase().trim() || "UNKNOWN";
    if (!cityMap.has(city)) cityMap.set(city, { delivered: 0, rto: 0, failed: 0, total: 0 });
    const c = cityMap.get(city)!;
    c.total++;
    const t = terminalState(s.status);
    if (t === "delivered") c.delivered++;
    else if (t === "rto") c.rto++;
    else if (t === "failed") c.failed++;
  }

  const allCityRows = Array.from(cityMap.entries())
    .filter(([city]) => city !== "UNKNOWN")
    .map(([city, c]) => {
      const closed = c.delivered + c.rto + c.failed;
      return {
        city,
        closed,
        delivered: c.delivered,
        rto: c.rto,
        failed: c.failed,
        deliveryRate: closed > 0 ? (c.delivered / closed) * 100 : 0,
        total: c.total,
      };
    });

  // City table — min 5 closed shipments, worst delivery rate first.
  const citiesBreakdown = allCityRows
    .filter((c) => c.closed >= 5)
    .sort((a, b) => a.deliveryRate - b.deliveryRate)
    .slice(0, 15)
    .map(({ total: _t, ...rest }) => rest);

  // Top cities by volume.
  const totalAll = all.length;
  const topCitiesByVolume = allCityRows
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((c) => ({
      city: c.city,
      count: c.total,
      pct: totalAll > 0 ? (c.total / totalAll) * 100 : 0,
    }));

  // ─── Delivery time histogram (delivered shipments only) ────────
  const histBuckets: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8+": 0 };
  let totalDelivered = 0;
  for (const s of all) {
    if ((s.status || "").toLowerCase().trim() !== "delivered") continue;
    const days = transitDays(s.bookedAt, s.statusAt);
    if (days == null) continue;
    totalDelivered++;
    const d = Math.max(1, Math.ceil(days));
    if (d === 1) histBuckets["1"]++;
    else if (d === 2) histBuckets["2"]++;
    else if (d === 3) histBuckets["3"]++;
    else if (d === 4) histBuckets["4"]++;
    else if (d === 5) histBuckets["5"]++;
    else if (d === 6) histBuckets["6"]++;
    else if (d === 7) histBuckets["7"]++;
    else histBuckets["8+"]++;
  }
  const histOrder = ["1", "2", "3", "4", "5", "6", "7", "8+"];
  const tierForHist = (label: string): "green" | "amber" | "orange" | "red" => {
    if (label === "1" || label === "2" || label === "3") return "green";
    if (label === "4" || label === "5") return "amber";
    if (label === "6" || label === "7") return "orange";
    return "red";
  };
  const deliveryHistogram = histOrder.map((label) => ({
    label,
    count: histBuckets[label],
    pct: totalDelivered > 0 ? (histBuckets[label] / totalDelivered) * 100 : 0,
    tier: tierForHist(label),
  }));

  // ─── RTO / failure reasons (terminal failures only) ────────────
  const reasonCounts: Record<string, number> = Object.fromEntries(NDR_REASON_BUCKETS.map((b) => [b.id, 0]));
  let totalReasonCases = 0;
  for (const s of all) {
    const t = terminalState(s.status);
    if (t !== "rto" && t !== "failed") continue;
    if (!s.lastRemarks || !FAILURE_REMARK_PATTERN.test(s.lastRemarks)) continue;
    for (const r of NDR_REASON_BUCKETS) {
      if (r.match.test(s.lastRemarks)) {
        reasonCounts[r.id]++;
        totalReasonCases++;
        break;
      }
    }
  }
  const failureReasons = NDR_REASON_BUCKETS
    .map((r) => ({
      label: r.label,
      count: reasonCounts[r.id],
      pct: totalReasonCases > 0 ? (reasonCounts[r.id] / totalReasonCases) * 100 : 0,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  // ─── Section 2 — Partnership health (date already filtered into `all`,
  //                                       city scoped here) ──────────
  const partnership = all.filter((s) => {
    if (cityParam) {
      const c = s.destination?.toUpperCase().trim() ?? "";
      if (c !== cityParam) return false;
    }
    return true;
  });

  const statusMap = new Map<string, { count: number; family: Family }>();
  for (const s of partnership) {
    const d = detailedStatus(s.status);
    let label = d.label;
    let family: Family = d.family;
    if ((label === "En route" || label === "Out for delivery") && (s.noOfAttempts ?? 0) >= 2) {
      label = "Reattempt initiated";
      family = "rtoProgress";
    }
    if (!statusMap.has(label)) statusMap.set(label, { count: 0, family });
    statusMap.get(label)!.count++;
  }

  const totalPartnership = partnership.length;
  const statusDistribution = Array.from(statusMap.entries())
    .map(([label, v]) => ({
      label,
      count: v.count,
      pct: totalPartnership > 0 ? (v.count / totalPartnership) * 100 : 0,
      family: v.family,
    }))
    .sort((a, b) => b.count - a.count);

  // Cities for the dropdown — derive from the un-date-filtered dataset so
  // the option list doesn't shrink as the user narrows the date range.
  const cities = Array.from(
    new Set(
      everyShipment
        .map((s) => s.destination?.toUpperCase().trim())
        .filter((c): c is string => !!c && c !== "UNKNOWN"),
    ),
  ).sort();

  return NextResponse.json({
    totalShipments: totalAll,
    citiesBreakdown: { rows: citiesBreakdown },
    topCitiesByVolume: { total: totalAll, rows: topCitiesByVolume },
    deliveryTimeHistogram: { totalDelivered, buckets: deliveryHistogram },
    failureReasons: { total: totalReasonCases, rows: failureReasons },
    partnership: {
      filters: { from: fromParam, to: toParam, city: cityParam },
      cities,
      totalShipments: totalPartnership,
      statusDistribution,
    },
  });
}
