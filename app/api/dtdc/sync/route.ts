import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trackAwb, parseDtdcDate, type DtdcTrackResponse } from "@/lib/dtdc";

// Allow up to 60s on Vercel Hobby. DTDC's API is single-AWB so we throttle
// concurrency and process in batches.
export const maxDuration = 60;

// Default: only re-sync AWBs whose last DtdcShipment.lastSyncedAt is older
// than STALE_HOURS. Override with ?force=1 to re-sync everything.
const STALE_HOURS = 4;

// How many AWBs to process per invocation. Vercel Hobby tier gives us 60s;
// DTDC ~1-2s per call × 4 concurrent = ~150 fit safely. Daily cron triggers
// at 04:00 IST so even a thousand-order backlog catches up in a week.
const BATCH_SIZE = 150;

type SyncOutcome = {
  awb: string;
  ok: boolean;
  status?: string;
  error?: string;
};

async function syncOne(awb: string, shopifyOrderNumber: number | null): Promise<SyncOutcome> {
  let resp: DtdcTrackResponse;
  try {
    resp = await trackAwb(awb);
  } catch (e) {
    return { awb, ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!resp.statusFlag || !resp.trackHeader) {
    return { awb, ok: false, error: resp.status || "no data" };
  }

  const h = resp.trackHeader;
  const statusAt = parseDtdcDate(h.strStatusTransOn, h.strStatusTransTime);
  const bookedAt = parseDtdcDate(h.strBookedDate, h.strBookedTime?.replace(/:/g, "").slice(0, 4));
  const attempts = parseInt(h.strNoOfAttempts || "0", 10) || 0;

  // Upsert the shipment header row.
  const shipment = await prisma.dtdcShipment.upsert({
    where: { awb },
    create: {
      awb,
      shopifyOrderNumber,
      refNo: h.strRefNo || null,
      status: h.strStatus || null,
      statusAt,
      noOfAttempts: attempts,
      rtoNumber: h.strRtoNumber || null,
      bookedAt,
      origin: h.strOrigin || null,
      destination: h.strDestination || null,
      lastRemarks: h.strRemarks || null,
      rawResponse: resp as unknown as object,
      lastSyncedAt: new Date(),
    },
    update: {
      shopifyOrderNumber,
      refNo: h.strRefNo || null,
      status: h.strStatus || null,
      statusAt,
      noOfAttempts: attempts,
      rtoNumber: h.strRtoNumber || null,
      bookedAt,
      origin: h.strOrigin || null,
      destination: h.strDestination || null,
      lastRemarks: h.strRemarks || null,
      rawResponse: resp as unknown as object,
      lastSyncedAt: new Date(),
    },
  });

  // Replace the event history. Cheaper + safer than diffing, and the history
  // for a given AWB is small (~10-20 rows in the worst case).
  const events = (resp.trackDetails || []).map((e) => {
    const occurredAt = parseDtdcDate(e.strActionDate, e.strActionTime);
    return {
      shipmentId: shipment.id,
      code: e.strCode || "",
      action: e.strAction || "",
      manifestNo: e.strManifestNo || null,
      origin: e.strOrigin || null,
      destination: e.strDestination || null,
      // Fall back to "now" if DTDC returns a malformed timestamp on a leg —
      // event still gets recorded.
      occurredAt: occurredAt ?? new Date(),
      remarks: e.sTrRemarks || null,
    };
  });

  await prisma.$transaction([
    prisma.dtdcShipmentEvent.deleteMany({ where: { shipmentId: shipment.id } }),
    prisma.dtdcShipmentEvent.createMany({ data: events }),
  ]);

  return { awb, ok: true, status: h.strStatus };
}

export async function GET(req: NextRequest) {
  // Cron-secret auth — same pattern as /api/shopify/sync. Accepts either a
  // ?token=<CRON_SECRET> query param or Authorization: Bearer <CRON_SECRET>
  // header (Vercel Cron sends the latter). Skipped entirely when no
  // CRON_SECRET is set (local dev with the env unset still works).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const queryToken = req.nextUrl.searchParams.get("token");
    const headerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/, "");
    const supplied = queryToken ?? headerToken;
    if (supplied !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") || "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : BATCH_SIZE;

  // 1. Find all Shopify orders that have a DTDC AWB.
  const candidates = await prisma.shopifyOrder.findMany({
    where: { dtdcAwb: { not: null } },
    select: { orderNumber: true, dtdcAwb: true },
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      message: "No DTDC AWBs found on Shopify orders. Run a Shopify sync first.",
      synced: 0,
    });
  }

  // 2. Optionally filter to stale ones only.
  const allAwbs = candidates
    .map((c) => ({ awb: c.dtdcAwb!.trim(), orderNumber: c.orderNumber }))
    .filter((c) => c.awb.length > 0);

  let toSync = allAwbs;
  if (!force) {
    const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
    const fresh = await prisma.dtdcShipment.findMany({
      where: { awb: { in: allAwbs.map((c) => c.awb) }, lastSyncedAt: { gte: cutoff } },
      select: { awb: true },
    });
    const freshSet = new Set(fresh.map((r) => r.awb));
    toSync = allAwbs.filter((c) => !freshSet.has(c.awb));
  }

  // 3. Take only the first `limit` so we don't blow the 60s budget.
  const batch = toSync.slice(0, limit);

  // 4. Run with small concurrency. DTDC's API isn't documented to rate-limit
  //    but we keep it polite.
  const CONCURRENCY = 4;
  const results: SyncOutcome[] = [];
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const out = await Promise.all(chunk.map((c) => syncOne(c.awb, c.orderNumber)));
    results.push(...out);
  }

  const okCount = results.filter((r) => r.ok).length;
  const errCount = results.length - okCount;

  return NextResponse.json({
    totalCandidates: allAwbs.length,
    pendingBeforeBatch: toSync.length,
    synced: okCount,
    failed: errCount,
    leftToProcess: Math.max(0, toSync.length - batch.length),
    results,
  });
}
