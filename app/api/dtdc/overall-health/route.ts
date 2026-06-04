import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Powers the DTDC Overall Health page. All aggregations computed in this
// single endpoint so the page only does one fetch + a few client-side casts.
//
// Accepts three optional filters (all applied to the booking date):
//   ?from=YYYY-MM-DD  ?to=YYYY-MM-DD  ?city=DELHI  ?status=delivered
// All filters are AND-ed. Date range filters by DtdcShipment.bookedAt.

const SLA_DAYS = 3;
// Failure-reason buckets — based on the real codes DTDC emits in
// `strRemarks` for non-delivered shipments. The pipe-prefix codes (PNA, KYC,
// NSR, ADR, UAT, DLK) are stable; matching on them gives us tighter buckets
// than matching the free-text description.
const NDR_REASON_BUCKETS: { id: string; label: string; match: RegExp }[] = [
  { id: "receiverUnreachable", label: "Receiver not reachable", match: /\bPNA\b|not\s*reachable/i },
  { id: "addressWrong", label: "Address wrong / incomplete", match: /\bADR\b|address\s*(incomplete|wrong|not\s*found)/i },
  { id: "nonServiceable", label: "Area non-serviceable", match: /\bNSR\b|non[\s-]*service|area\s*non/i },
  { id: "refused", label: "Refused / KYC", match: /\bKYC\b|\bREF\b|refuse/i },
  { id: "notAttempted", label: "Could not attempt", match: /\bUAT\b|could\s*not\s*attempt/i },
  { id: "officeClosed", label: "Office closed / door lock", match: /\bDLK\b|door\s*lock|office\s*closed/i },
];

// Only treat a remark as a failure reason when it looks like one — i.e. it
// starts with a 3-letter uppercase code and a pipe (DTDC's failure code
// convention). Routing breadcrumbs like "Out Going Load Made To..." and raw
// numeric weights ("0.00", "4.50") are scan history, not failure remarks,
// and would otherwise pollute the buckets.
const FAILURE_REMARK_PATTERN = /^[A-Z]{3}\|/;

// Map DTDC's free-form status string into one of our 4 buckets, aligned
// with how DTDC's own customer portal classifies things:
//   • Delivered  = the parcel reached the consignee
//   • RTO        = anything in the return-to-origin lifecycle (initiated,
//                  awaiting approval, in-transit back, delivered to seller,
//                  failed RTO attempts, "Return as per client instruction")
//   • In transit = everything else that's moving (in transit, OFD, reached,
//                  not delivered, weekly off, mis-route, received at hub)
//   • Booked     = pickup scheduled / booked but not yet picked up
function statusBucket(status: string | null | undefined): "delivered" | "inTransit" | "booked" | "rto" {
  if (!status) return "booked";
  const s = status.toLowerCase();
  if (s === "delivered") return "delivered";
  // Match "rto" anywhere (handles "Set RTO initiated", "Waiting For RTO
  // Approval", "RTO In Transit", etc.) plus the special "Return as per
  // client instruction" string DTDC emits when the merchant cancels.
  if (/rto|return/.test(s)) return "rto";
  if (
    /in transit|out for delivery|reached|received at|mis route|weekly off|not delivered|ofd/.test(s)
  ) {
    return "inTransit";
  }
  return "booked";
}

function transitDays(booked: Date | null, statusAt: Date | null): number | null {
  if (!booked || !statusAt) return null;
  const ms = statusAt.getTime() - booked.getTime();
  if (ms < 0) return null;
  return ms / 86_400_000;
}

function weekStartIso(d: Date): string {
  // Monday-anchored ISO week start.
  const dt = new Date(d);
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const cityFilter = req.nextUrl.searchParams.get("city")?.trim().toUpperCase();
  const statusFilter = req.nextUrl.searchParams.get("status")?.trim();

  // Build the where clause for the shipment query.
  type ShipWhere = {
    bookedAt?: { gte?: Date; lte?: Date };
    destination?: { equals: string; mode: "insensitive" };
    status?: { equals: string; mode: "insensitive" };
  };
  const where: ShipWhere = {};
  if (from || to) {
    where.bookedAt = {};
    if (from) where.bookedAt.gte = new Date(from);
    if (to) {
      const t = new Date(to);
      t.setHours(23, 59, 59, 999);
      where.bookedAt.lte = t;
    }
  }
  if (cityFilter) where.destination = { equals: cityFilter, mode: "insensitive" };
  if (statusFilter) where.status = { equals: statusFilter, mode: "insensitive" };

  const shipments = await prisma.dtdcShipment.findMany({
    where,
    select: {
      id: true,
      awb: true,
      status: true,
      statusAt: true,
      bookedAt: true,
      destination: true,
      lastRemarks: true,
      noOfAttempts: true,
      rtoNumber: true,
    },
  });

  // Pickup lag — for each shipment, find the earliest "hub-received" event
  // (codes CDIN / IBMD / inscan) and diff against bookedAt. Average across all.
  const shipmentIds = shipments.map((s) => s.id);
  const pickupEvents = shipmentIds.length
    ? await prisma.dtdcShipmentEvent.findMany({
        where: {
          shipmentId: { in: shipmentIds },
          code: { in: ["CDIN", "IBMD", "inscan"] },
        },
        select: { shipmentId: true, occurredAt: true },
        orderBy: { occurredAt: "asc" },
      })
    : [];
  // Map: shipmentId -> earliest pickup event timestamp
  const firstPickupAt = new Map<number, Date>();
  for (const e of pickupEvents) {
    if (!firstPickupAt.has(e.shipmentId)) firstPickupAt.set(e.shipmentId, e.occurredAt);
  }

  const total = shipments.length;
  if (total === 0) {
    return NextResponse.json({
      filters: { from, to, city: cityFilter, status: statusFilter },
      empty: true,
    });
  }

  // Bucket once.
  const buckets = { delivered: 0, inTransit: 0, booked: 0, rto: 0 };
  const transitTimes: number[] = [];
  const transitBuckets: Record<string, number> = { "1d": 0, "2d": 0, "3d": 0, "4d": 0, "5d": 0, "6d+": 0 };
  const cityStats = new Map<string, { total: number; delivered: number; transit: number[] }>();
  const reasonCounts: Record<string, number> = Object.fromEntries(NDR_REASON_BUCKETS.map((b) => [b.id, 0]));
  let firstAttemptDelivered = 0;
  let onTimeDelivered = 0;
  const weeklyBuckets = new Map<string, { booked: number; delivered: number }>();

  for (const s of shipments) {
    const b = statusBucket(s.status);
    buckets[b]++;

    const city = s.destination?.toUpperCase() ?? "UNKNOWN";
    if (!cityStats.has(city)) cityStats.set(city, { total: 0, delivered: 0, transit: [] });
    const cs = cityStats.get(city)!;
    cs.total++;

    if (b === "delivered") {
      const days = transitDays(s.bookedAt, s.statusAt);
      if (days != null) {
        transitTimes.push(days);
        cs.transit.push(days);
        if (days <= 1) transitBuckets["1d"]++;
        else if (days <= 2) transitBuckets["2d"]++;
        else if (days <= 3) transitBuckets["3d"]++;
        else if (days <= 4) transitBuckets["4d"]++;
        else if (days <= 5) transitBuckets["5d"]++;
        else transitBuckets["6d+"]++;
        if (days <= SLA_DAYS) onTimeDelivered++;
      }
      cs.delivered++;
      if (s.noOfAttempts === 1) firstAttemptDelivered++;
    }

    // Failure reasons — only for shipments with a non-delivered status AND
    // a remark that looks like a failure code (e.g. "PNA|..."), not a transit
    // breadcrumb or numeric weight.
    if (b !== "delivered" && s.lastRemarks && FAILURE_REMARK_PATTERN.test(s.lastRemarks)) {
      for (const r of NDR_REASON_BUCKETS) {
        if (r.match.test(s.lastRemarks)) {
          reasonCounts[r.id]++;
          break;
        }
      }
    }

    // Weekly bucket — keyed by Monday ISO date of the booking week.
    if (s.bookedAt) {
      const wk = weekStartIso(s.bookedAt);
      if (!weeklyBuckets.has(wk)) weeklyBuckets.set(wk, { booked: 0, delivered: 0 });
      const wb = weeklyBuckets.get(wk)!;
      wb.booked++;
      if (b === "delivered") wb.delivered++;
    }
  }

  // Funnel — booked total, "shipped" = anything past booking, delivered.
  const funnel = {
    booked: total,
    shipped: total - buckets.booked, // anything that left the booked bucket
    delivered: buckets.delivered,
  };

  const deliveredPct = total > 0 ? (buckets.delivered / total) * 100 : 0;
  const rtoPct = total > 0 ? (buckets.rto / total) * 100 : 0;
  const firstAttemptPct = buckets.delivered > 0 ? (firstAttemptDelivered / buckets.delivered) * 100 : 0;
  const onTimeSlaPct = buckets.delivered > 0 ? (onTimeDelivered / buckets.delivered) * 100 : 0;
  // NDR recovery = delivered after 2+ attempts / (delivered + still-failing)
  const ndrAttempted = shipments.filter((s) => s.noOfAttempts >= 2).length;
  const ndrRecovered = shipments.filter((s) => s.noOfAttempts >= 2 && statusBucket(s.status) === "delivered").length;
  const ndrRecoveryPct = ndrAttempted > 0 ? (ndrRecovered / ndrAttempted) * 100 : 0;

  const avgTransit = transitTimes.length
    ? transitTimes.reduce((a, b) => a + b, 0) / transitTimes.length
    : null;

  // Average pickup lag (days) — bookedAt → first hub-receive event.
  const pickupLags: number[] = [];
  for (const s of shipments) {
    const picked = firstPickupAt.get(s.id);
    if (s.bookedAt && picked) {
      const days = (picked.getTime() - s.bookedAt.getTime()) / 86_400_000;
      if (days >= 0 && days < 30) pickupLags.push(days); // sanity-cap at 30 days
    }
  }
  const avgPickupLag = pickupLags.length
    ? pickupLags.reduce((a, b) => a + b, 0) / pickupLags.length
    : null;

  // City performance — top 6 by volume.
  const cityPerf = Array.from(cityStats.entries())
    .map(([city, s]) => ({
      city,
      total: s.total,
      deliveredPct: s.total > 0 ? (s.delivered / s.total) * 100 : 0,
      avgTransit: s.transit.length ? s.transit.reduce((a, b) => a + b, 0) / s.transit.length : null,
    }))
    .filter((c) => c.city !== "UNKNOWN")
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  // Weekly volume — last 8 weeks.
  const weeklyVolume = Array.from(weeklyBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([week, v]) => ({ week, booked: v.booked, delivered: v.delivered }));

  // Reasons — strip zero-count buckets.
  const reasons = NDR_REASON_BUCKETS.map((r) => ({
    label: r.label,
    count: reasonCounts[r.id],
  })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    filters: { from, to, city: cityFilter, status: statusFilter },
    empty: false,
    total,
    statusMix: {
      delivered: buckets.delivered,
      inTransit: buckets.inTransit,
      booked: buckets.booked,
      rto: buckets.rto,
    },
    deliveryKpis: {
      deliveredPct,
      onTimeSlaPct: buckets.delivered > 0 ? onTimeSlaPct : null,
      firstAttemptPct: buckets.delivered > 0 ? firstAttemptPct : null,
      rtoPct,
      ndrRecoveryPct: ndrAttempted > 0 ? ndrRecoveryPct : null,
    },
    speedCost: {
      avgTransit, // days
      pickupLag: avgPickupLag, // days from softdata upload to hub receive
      costPerDelivered: null,  // not in our data
      rtoCostMonth: null,      // not in our data
      totalShipments: total,
    },
    funnel,
    transitSpread: transitBuckets,
    weeklyVolume,
    cityPerformance: cityPerf,
    failureReasons: reasons,
  });
}
