import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Backs the DTDC Needs Attention page. Returns 4 cohort lists + their counts
// in a single payload so the page can switch between tiles instantly without
// re-hitting the API. All cohorts derived from the latest DtdcShipment row
// per AWB (kept fresh by the daily /api/dtdc/sync cron).

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

export type AttentionPayload = {
  asOf: string;
  failedFirstAttempt: { count: number; rows: AttentionShipment[] };
  agedInTransit: { count: number; rows: AttentionShipment[] };
  fourPlusAttempts: { count: number; rows: AttentionShipment[] };
  rtoAwaiting: { count: number; rows: AttentionShipment[] };
};

const NOT_DELIVERED_STATUSES = new Set([
  "ATTEMPTED",
  "NOT DELIVERED",
  "DELIVERY PROCESS IN PROGRESS",
  "HELDUP",
  "OUT FOR DELIVERY",
  "IN TRANSIT",
]);

function isInTransit(status: string | null): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  if (s === "DELIVERED") return false;
  if (s.startsWith("RTO")) return false;
  return true;
}

function daysSince(d: Date | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export async function GET() {
  // Pull every shipment that isn't fully delivered or RTO-completed. We need
  // them in one query so we can re-bucket in JS (cheaper than 4 queries).
  const all = await prisma.dtdcShipment.findMany({
    where: {
      NOT: [
        { status: { equals: "Delivered", mode: "insensitive" } },
      ],
    },
    select: {
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

  // Look up phones via ShopifyOrder using the linked order numbers.
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

  // Cohort 1 — Failed 1st attempt only (attempts == 1 and not delivered yet)
  const failedFirstAttempt = all.filter(
    (s) => s.noOfAttempts === 1 && isInTransit(s.status),
  );

  // Cohort 2 — In transit > 5 days
  const agedInTransit = all.filter(
    (s) => isInTransit(s.status) && (daysSince(s.bookedAt) ?? 0) > 5,
  );

  // Cohort 3 — 4+ attempts
  const fourPlusAttempts = all.filter((s) => s.noOfAttempts >= 4);

  // Cohort 4 — RTO initiated, awaiting decision (has rtoNumber set and status
  // contains RTO but not yet completed/RTO-delivered).
  const rtoAwaiting = all.filter(
    (s) =>
      (s.rtoNumber && s.rtoNumber.trim().length > 0) ||
      (s.status && /rto/i.test(s.status)),
  );

  const payload: AttentionPayload = {
    asOf: new Date().toISOString(),
    failedFirstAttempt: {
      count: failedFirstAttempt.length,
      rows: failedFirstAttempt.map(toRow),
    },
    agedInTransit: {
      count: agedInTransit.length,
      rows: agedInTransit.map(toRow),
    },
    fourPlusAttempts: {
      count: fourPlusAttempts.length,
      rows: fourPlusAttempts.map(toRow),
    },
    rtoAwaiting: {
      count: rtoAwaiting.length,
      rows: rtoAwaiting.map(toRow),
    },
  };

  // Silence the unused-var warning when no statuses match the noisy set.
  void NOT_DELIVERED_STATUSES;

  return NextResponse.json(payload);
}
