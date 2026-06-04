import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Backs the DTDC Needs Attention page (v2). Returns 3 grouped sections, each
// with N sub-buckets and the matching shipment rows so the page can switch
// between buckets without re-hitting the API.
//
//   1. Ageing open shipments       — by days since bookedAt
//   2. Action required             — RTO approve-awaited / prepared-not-collected
//                                    / booked-not-moving (action on you vs. DTDC)
//   3. Field failures              — Failed by reason / RTO pipeline /
//                                    Multi-attempt

export type AttentionShipment = {
  awb: string;
  refNo: string | null;
  city: string | null;
  phone: string | null;
  ageDays: number | null;
  reason: string | null;
  status: string | null;
  attempts: number;
};

const FAILURE_REMARK_PATTERN = /^[A-Z]{3}\|/;
const REASON_BUCKETS: { id: string; label: string; match: RegExp }[] = [
  { id: "receiverUnreachable", label: "Receiver unreachable", match: /\bPNA\b/ },
  { id: "addressProblem", label: "Address problem", match: /\bADR\b/ },
  { id: "nonServiceable", label: "Non-serviceable", match: /\bNSR\b/ },
  { id: "refused", label: "Refused", match: /\bKYC\b|\bREF\b/ },
  { id: "couldNotAttempt", label: "Could not attempt", match: /\bUAT\b/ },
  { id: "officeClosed", label: "Office closed", match: /\bDLK\b/ },
];

function isOpen(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  if (s === "delivered" || s === "rto delivered") return false;
  return true;
}

function daysSince(d: Date | null): number {
  if (!d) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function isRtoAwaitingApproval(status: string | null | undefined): boolean {
  if (!status) return false;
  return /^(set rto initiated|waiting for rto approval)/i.test(status);
}

// "Prepared — not collected" = merchant ran softdata upload but DTDC has not
// physically picked up yet. Caught by status being booked/pickup-scheduled
// AND no hub-receive event in the scan history.
function isPreparedNotCollected(
  status: string | null | undefined,
  hubReceived: boolean,
): boolean {
  if (!status) return false;
  if (hubReceived) return false;
  return /pickup scheduled|pickup awaited|^booked$|softdata|softdata upload/i.test(status);
}

// "Booked — not moving" = DTDC has the parcel (hub-received) but it hasn't
// left the hub or shown any forward motion. Picked up but stuck.
function isBookedNotMoving(
  status: string | null | undefined,
  hubReceived: boolean,
  hasInTransit: boolean,
): boolean {
  if (!status) return false;
  if (!hubReceived) return false;
  if (hasInTransit) return false;
  return /booked|received at|reached at destination/i.test(status);
}

export async function GET() {
  // Pull every open shipment (not delivered, not RTO-completed).
  const all = await prisma.dtdcShipment.findMany({
    select: {
      id: true,
      awb: true,
      refNo: true,
      destination: true,
      lastRemarks: true,
      status: true,
      statusAt: true,
      bookedAt: true,
      noOfAttempts: true,
      rtoNumber: true,
      shopifyOrderNumber: true,
    },
  });
  const open = all.filter((s) => isOpen(s.status));

  // Pull scan events for the open shipments — needed to distinguish
  // "Prepared / not collected" from "Booked / not moving".
  const openIds = open.map((s) => s.id);
  const events = openIds.length
    ? await prisma.dtdcShipmentEvent.findMany({
        where: { shipmentId: { in: openIds } },
        select: { shipmentId: true, code: true },
      })
    : [];
  const hubReceivedSet = new Set<number>();
  const hasInTransitSet = new Set<number>();
  for (const e of events) {
    const c = (e.code || "").toUpperCase();
    if (c === "CDIN" || c === "IBMD" || c === "INSCAN") hubReceivedSet.add(e.shipmentId);
    if (c === "CDOUT" || c === "OBMD" || c === "OUTDLV" || c === "OPMF") hasInTransitSet.add(e.shipmentId);
  }

  // Phone lookup for the action tables.
  const orderNums = Array.from(
    new Set(all.map((s) => s.shopifyOrderNumber).filter((n): n is number => n != null)),
  );
  const phones = orderNums.length
    ? await prisma.shopifyOrder.findMany({
        where: { orderNumber: { in: orderNums } },
        select: { orderNumber: true, phone: true },
      })
    : [];
  const phoneByOrder = new Map(phones.map((p) => [p.orderNumber, p.phone]));

  const toRow = (s: typeof all[number]): AttentionShipment => ({
    awb: s.awb,
    refNo: s.refNo,
    city: s.destination,
    phone: s.shopifyOrderNumber ? phoneByOrder.get(s.shopifyOrderNumber) ?? null : null,
    ageDays: daysSince(s.bookedAt),
    reason: s.lastRemarks,
    status: s.status,
    attempts: s.noOfAttempts ?? 0,
  });

  // ───── Section 1: Ageing open shipments ─────
  const ageingBuckets = {
    tenPlus: [] as typeof open,
    sixToTen: [] as typeof open,
    threeToFive: [] as typeof open,
    zeroToTwo: [] as typeof open,
  };
  for (const s of open) {
    const d = daysSince(s.bookedAt);
    if (d >= 10) ageingBuckets.tenPlus.push(s);
    else if (d >= 6) ageingBuckets.sixToTen.push(s);
    else if (d >= 3) ageingBuckets.threeToFive.push(s);
    else ageingBuckets.zeroToTwo.push(s);
  }

  // ───── Section 2: Action required ─────
  const rtoApproveAwaited = open.filter((s) => isRtoAwaitingApproval(s.status));
  const preparedNotCollected = open.filter(
    (s) => isPreparedNotCollected(s.status, hubReceivedSet.has(s.id)) && daysSince(s.bookedAt) >= 2,
  );
  const bookedNotMoving = open.filter(
    (s) =>
      isBookedNotMoving(
        s.status,
        hubReceivedSet.has(s.id),
        hasInTransitSet.has(s.id),
      ) && daysSince(s.bookedAt) >= 2,
  );

  // ───── Section 3: Field failures ─────

  // Failed by reason — only open shipments with a recognisable failure remark.
  const reasonShipments = open.filter(
    (s) => s.lastRemarks && FAILURE_REMARK_PATTERN.test(s.lastRemarks),
  );
  const reasonCountsMap = new Map<string, { label: string; count: number; rows: typeof open }>();
  for (const b of REASON_BUCKETS) {
    reasonCountsMap.set(b.id, { label: b.label, count: 0, rows: [] });
  }
  for (const s of reasonShipments) {
    for (const b of REASON_BUCKETS) {
      if (b.match.test(s.lastRemarks!)) {
        const entry = reasonCountsMap.get(b.id)!;
        entry.count++;
        entry.rows.push(s);
        break;
      }
    }
  }
  const reasonBreakdown = Array.from(reasonCountsMap.values())
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const failedByReasonTotal = reasonBreakdown.reduce((a, r) => a + r.count, 0);
  const failedByReasonRows = reasonBreakdown.flatMap((r) => r.rows);

  // RTO pipeline — full RTO funnel, broken by sub-state.
  const rtoAll = all.filter((s) => {
    const st = s.status?.toLowerCase() ?? "";
    return /rto|return/.test(st);
  });
  const rtoBuckets = {
    approveAwaited: [] as typeof open,
    inTransitBack: [] as typeof open,
    nonDelivered: [] as typeof open,
    receivedBack: [] as typeof open,
  };
  for (const s of rtoAll) {
    const st = (s.status || "").toLowerCase();
    if (/^(set rto initiated|waiting for rto approval)/.test(st)) rtoBuckets.approveAwaited.push(s);
    else if (/in transit/.test(st)) rtoBuckets.inTransitBack.push(s);
    else if (/not delivered/.test(st)) rtoBuckets.nonDelivered.push(s);
    else if (/^rto delivered$/.test(st)) rtoBuckets.receivedBack.push(s);
  }
  const rtoTotal =
    rtoBuckets.approveAwaited.length +
    rtoBuckets.inTransitBack.length +
    rtoBuckets.nonDelivered.length +
    rtoBuckets.receivedBack.length;

  // Multi-attempt — live pipeline only (open shipments).
  const multi = {
    fourPlus: open.filter((s) => (s.noOfAttempts ?? 0) >= 4),
    three: open.filter((s) => (s.noOfAttempts ?? 0) === 3),
    two: open.filter((s) => (s.noOfAttempts ?? 0) === 2),
  };
  const multiTotal = multi.fourPlus.length + multi.three.length + multi.two.length;

  // Map helper.
  const mapRows = (arr: typeof open) => arr.map(toRow);

  return NextResponse.json({
    asOf: new Date().toISOString(),
    ageingOpen: {
      tenPlus: { count: ageingBuckets.tenPlus.length, rows: mapRows(ageingBuckets.tenPlus) },
      sixToTen: { count: ageingBuckets.sixToTen.length, rows: mapRows(ageingBuckets.sixToTen) },
      threeToFive: { count: ageingBuckets.threeToFive.length, rows: mapRows(ageingBuckets.threeToFive) },
      zeroToTwo: { count: ageingBuckets.zeroToTwo.length, rows: mapRows(ageingBuckets.zeroToTwo) },
    },
    actionRequired: {
      rtoApproveAwaited: { count: rtoApproveAwaited.length, rows: mapRows(rtoApproveAwaited) },
      preparedNotCollected: { count: preparedNotCollected.length, rows: mapRows(preparedNotCollected) },
      bookedNotMoving: { count: bookedNotMoving.length, rows: mapRows(bookedNotMoving) },
    },
    fieldFailures: {
      failedByReason: {
        total: failedByReasonTotal,
        breakdown: reasonBreakdown.map((r) => ({ label: r.label, count: r.count })),
        rows: mapRows(failedByReasonRows),
      },
      rtoPipeline: {
        total: rtoTotal,
        breakdown: [
          { label: "Approve awaited", count: rtoBuckets.approveAwaited.length },
          { label: "In transit back", count: rtoBuckets.inTransitBack.length },
          { label: "Non-delivered", count: rtoBuckets.nonDelivered.length },
          { label: "Received back", count: rtoBuckets.receivedBack.length },
        ],
        rows: mapRows([
          ...rtoBuckets.approveAwaited,
          ...rtoBuckets.inTransitBack,
          ...rtoBuckets.nonDelivered,
          ...rtoBuckets.receivedBack,
        ]),
      },
      multiAttempt: {
        total: multiTotal,
        breakdown: [
          { label: "4+ attempts", count: multi.fourPlus.length },
          { label: "3 attempts", count: multi.three.length },
          { label: "2 attempts", count: multi.two.length },
        ],
        rows: mapRows([...multi.fourPlus, ...multi.three, ...multi.two]),
      },
    },
  });
}
