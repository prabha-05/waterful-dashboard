import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trackAwb, parseDtdcDate, type DtdcTrackResponse } from "@/lib/dtdc";

// Allow up to 60s on Vercel Hobby. DTDC's API is single-AWB so we throttle
// concurrency and process in batches.
export const maxDuration = 60;

// Default: only re-sync AWBs whose last DtdcShipment.lastSyncedAt is older
// than STALE_HOURS. Override with ?force=1 to re-sync everything.
const STALE_HOURS = 4;

// How many AWBs to process per invocation. DTDC answers in ~0.5s, so 6
// concurrent gets through ~250 well inside the 60s budget. TIME_BUDGET_MS is
// the real guard — we stop and return a summary rather than getting killed
// mid-batch by the platform.
const BATCH_SIZE = 250;
const CONCURRENCY = 6;
const TIME_BUDGET_MS = 50_000;

// Statuses that never change again — no point spending API calls re-checking
// them every night. Everything else (in transit, OFD, not delivered, any RTO
// stage) can still move, so it stays in rotation.
const TERMINAL_STATUSES = new Set(["delivered", "rto delivered"]);

// DTDC's tracking API only serves recent consignments — older AWBs come back
// with statusFlag=false forever. Without this window the queue is dominated by
// dead 2025 AWBs that can never succeed, which is exactly what stalled this
// job between June and July 2026. Override with ?days=.
const UNTRACKED_WINDOW_DAYS = 75;

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

  const startedAt = Date.now();
  const params = req.nextUrl.searchParams;
  const force = params.get("force") === "1";
  // ?includeOld=1 ignores the age window — for a deliberate one-off sweep of
  // the historical backlog, not for the nightly cron.
  const includeOld = params.get("includeOld") === "1" || force;
  const limitParam = parseInt(params.get("limit") || "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : BATCH_SIZE;
  const daysParam = parseInt(params.get("days") || "", 10);
  const windowDays = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : UNTRACKED_WINDOW_DAYS;

  // 1. Find all Shopify orders that have a DTDC AWB. Dedupe by AWB, keeping
  //    the most recent order — the same AWB can appear on a re-created order.
  const candidates = await prisma.shopifyOrder.findMany({
    where: { dtdcAwb: { not: null } },
    select: { orderNumber: true, dtdcAwb: true, createdAt: true },
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      message: "No DTDC AWBs found on Shopify orders. Run a Shopify sync first.",
      synced: 0,
    });
  }

  const byAwb = new Map<string, { awb: string; orderNumber: number; orderedAt: Date }>();
  for (const c of candidates) {
    const awb = c.dtdcAwb!.trim();
    if (!awb) continue;
    const prev = byAwb.get(awb);
    if (!prev || c.createdAt > prev.orderedAt) {
      byAwb.set(awb, { awb, orderNumber: c.orderNumber, orderedAt: c.createdAt });
    }
  }
  const allAwbs = Array.from(byAwb.values());

  // 2. Build the work queue by priority instead of taking an arbitrary slice.
  //    The old version passed the un-ordered findMany straight to .slice(0,150),
  //    so every run chewed through the same head of the table — mostly aged-out
  //    2025 AWBs and already-Delivered ones — and never reached new shipments.
  const shipments = await prisma.dtdcShipment.findMany({
    select: { awb: true, status: true, lastSyncedAt: true },
  });
  const shipmentByAwb = new Map(shipments.map((s) => [s.awb, s]));

  const windowCutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

  const untracked: typeof allAwbs = []; // never successfully tracked
  const active: typeof allAwbs = []; // tracked, still moving
  let skippedTerminal = 0;
  let skippedTooOld = 0;
  let skippedFresh = 0;

  for (const c of allAwbs) {
    const s = shipmentByAwb.get(c.awb);

    if (!s) {
      if (!includeOld && c.orderedAt < windowCutoff) {
        skippedTooOld++;
        continue;
      }
      untracked.push(c);
      continue;
    }

    if (!force && TERMINAL_STATUSES.has((s.status || "").toLowerCase().trim())) {
      skippedTerminal++;
      continue;
    }
    if (!force && s.lastSyncedAt >= staleCutoff) {
      skippedFresh++;
      continue;
    }
    active.push(c);
  }

  // Newest orders first — those are the ones DTDC still has data for, and the
  // ones the dashboard is missing.
  untracked.sort((a, b) => b.orderedAt.getTime() - a.orderedAt.getTime());
  // Longest-unrefreshed first, so nothing in flight goes stale indefinitely.
  active.sort((a, b) => {
    const sa = shipmentByAwb.get(a.awb)!.lastSyncedAt.getTime();
    const sb = shipmentByAwb.get(b.awb)!.lastSyncedAt.getTime();
    return sa - sb;
  });

  const toSync = [...untracked, ...active];
  const batch = toSync.slice(0, limit);

  // 3. Run with small concurrency. DTDC's API isn't documented to rate-limit
  //    but we keep it polite. Bail out before the platform kills us so the
  //    caller always gets a usable summary.
  const results: SyncOutcome[] = [];
  let stoppedEarly = false;
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
    const chunk = batch.slice(i, i + CONCURRENCY);
    const out = await Promise.all(chunk.map((c) => syncOne(c.awb, c.orderNumber)));
    results.push(...out);
  }

  const okCount = results.filter((r) => r.ok).length;
  const errCount = results.length - okCount;

  return NextResponse.json({
    totalCandidates: allAwbs.length,
    queue: {
      untracked: untracked.length,
      active: active.length,
      skippedTerminal,
      skippedFresh,
      skippedTooOld,
    },
    attempted: results.length,
    synced: okCount,
    failed: errCount,
    leftToProcess: Math.max(0, toSync.length - results.length),
    stoppedEarly,
    elapsedMs: Date.now() - startedAt,
    // Full result list is noisy at batch=250; the failures are what you debug.
    errors: results.filter((r) => !r.ok).slice(0, 25),
  });
}
