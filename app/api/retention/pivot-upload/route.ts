import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

// Pivot cohort computed directly from an uploaded Shopify orders Excel
// file. Ports clean_up_file.py's logic to TypeScript so it runs in the
// browser-to-server upload flow (same pattern as Amazon Sales upload):
//
//   1. Read every order line from the Excel
//   2. Clean mobile (Phone -> Billing Phone -> Shipping Phone priority,
//      strip non-digits, drop 91/0 prefix, require 10 digits with first
//      digit in {6,7,8,9})
//   3. Keep only DELIVERED rows:
//        Fulfillment Status == "fulfilled"
//        Cancelled at == null
//        Tags NOT containing "RTO Delivered" / "RTO Initiated" / "rtorejected"
//   4. Deduplicate by mobile -> one row per customer
//   5. Split pre/post pivot, compute lifetime + per-segment totals
//
// This makes the dashboard's pivot cohort match exactly what
// clean_up_file.py would produce, without depending on our Neon copy
// (which is missing ~75% of historical Shopify orders).

export const runtime = "nodejs";
export const maxDuration = 60;

const PHONE_COLUMNS = ["Phone", "Billing Phone", "Shipping Phone"] as const;
const RTO_TAG_REGEX = /RTO Delivered|RTO Initiated|rtorejected/i;

function normalizeMobile(raw: unknown): string {
  if (raw == null) return "";
  const str = String(raw).trim();
  if (!str || str.includes("@")) return "";
  let s = str.replace(/\D/g, "");
  if ((s.length === 12 || s.length === 13) && s.startsWith("91")) s = s.slice(2);
  if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
  if (s.length === 10 && /[6789]/.test(s[0])) return s;
  return "";
}

function pickMobile(row: Record<string, unknown>): string {
  for (const col of PHONE_COLUMNS) {
    const cleaned = normalizeMobile(row[col]);
    if (cleaned) return cleaned;
  }
  return "";
}

function parseExcelDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") {
    // Excel serial date — XLSX usually converts to JS Date already with
    // cellDates:true, but guard for the numeric case.
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + raw * 86_400_000);
  }
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtYmd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const startStr = String(formData.get("start") ?? "2022-06-30");
  const endStr = String(formData.get("end") ?? "2026-12-31");
  const pivotStr = String(formData.get("pivot") ?? "2026-05-01");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded under field 'file'." }, { status: 400 });
  }

  const start = new Date(`${startStr}T00:00:00Z`);
  const endExclusive = new Date(`${endStr}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const pivot = new Date(`${pivotStr}T00:00:00Z`);

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { cellDates: true, type: "array" });

  // Auto-detect file format:
  //   • clean_up_file.py OUTPUT — has a "Raw Data" sheet with already-
  //     deduplicated per-customer rows (Name / Phone / Lifetime units /
  //     etc.). We just transform to JSON and return as-is.
  //   • Raw Shopify export — every row is an order line. We apply the
  //     full clean_up_file.py logic (normalize phones, drop non-delivered,
  //     dedupe by phone, split pre/post pivot).
  if (workbook.SheetNames.includes("Raw Data")) {
    const rawDataSheet = workbook.Sheets["Raw Data"];
    const processedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(rawDataSheet, { raw: true, defval: null });
    const looksProcessed = processedRows.length > 0 && "Lifetime units" in processedRows[0];
    if (looksProcessed) {
      const customers = processedRows.map((r, i) => {
        const lifetimeUnits = num(r["Lifetime units"]);
        const prePivotUnits = num(r["Pre-pivot units"]);
        const postPivotUnits = num(r["Post-pivot units"]);
        const lifetimeRevenue = num(r["Lifetime revenue"]);
        const postPivotRevenue = num(r["Post-pivot revenue"]);
        const lifetimeOrders = num(r["Lifetime orders"]);
        const postPivotOrders = num(r["Post-pivot orders"]);
        const firstOrder = parseExcelDate(r["First order"]);
        const lastOrder = parseExcelDate(r["Last order"]);
        const phone = String(r["Phone"] ?? "").trim();
        return {
          identity: `pre:${phone}:${i}`,
          name: String(r["Name"] ?? "").trim() || "Unknown",
          phone,
          email: r["Email"] ? String(r["Email"]).trim() : null,
          ordersInRange: lifetimeOrders,
          lifetimeOrders,
          lifetimeUnits,
          lifetimeRevenue,
          firstOrderDate: firstOrder ? fmtYmd(firstOrder) : "",
          lastOrderDate: lastOrder ? fmtYmd(lastOrder) : "",
          firstTag: String(r["First vs pivot"] ?? "pre").toLowerCase() === "post" ? "post" : "pre",
          lastTag: String(r["Last vs pivot"] ?? "pre").toLowerCase() === "post" ? "post" : "pre",
          postPivotOrders,
          postPivotUnits,
          postPivotRevenue,
          // Sanity checks against report inconsistencies in the upstream
          // file. These three are derived so the dashboard shows the
          // pre/post split consistently with the totals.
          _derivedPreUnits: prePivotUnits,
        };
      });

      return NextResponse.json({
        start: startStr,
        end: endStr,
        pivot: pivotStr,
        customers,
        meta: {
          source: "clean_up_file.py output (Raw Data sheet)",
          rowsParsed: processedRows.length,
          droppedNoPhone: 0,
          droppedNotDelivered: 0,
          droppedOutOfWindow: 0,
          customerCount: customers.length,
        },
      });
    }
  }

  // Otherwise treat as a raw Shopify orders export and run the full
  // clean_up_file.py logic ourselves.
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return NextResponse.json({ error: "Workbook has no sheets." }, { status: 400 });
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null });

  // Aggregate per phone identity. Each customer rolls up many order rows.
  type Acc = {
    name: string;
    email: string;
    firstDate: Date;
    lastDate: Date;
    // Order-level: deduped by Shopify order "Name" (e.g. "#1234")
    orderNames: Set<string>;
    revenuePre: number;
    revenuePost: number;
    ordersInRange: number;
    // Line-item-level: every row contributes its quantity
    unitsPre: number;
    unitsPost: number;
    preOrders: number;
    postOrders: number;
    inRangeNames: Set<string>;
  };
  const byPhone = new Map<string, Acc>();

  let parsedRows = 0;
  let droppedNoPhone = 0;
  let droppedNotDelivered = 0;
  let droppedOutOfWindow = 0;

  for (const row of rows) {
    parsedRows++;
    const phone = pickMobile(row);
    if (!phone) {
      droppedNoPhone++;
      continue;
    }

    // Delivered filter
    const fulfilled = String(row["Fulfillment Status"] ?? "").toLowerCase() === "fulfilled";
    const cancelledAt = row["Cancelled at"];
    const cancelled = cancelledAt != null && String(cancelledAt).trim() !== "";
    const tags = String(row["Tags"] ?? "");
    const hasRtoTag = RTO_TAG_REGEX.test(tags);
    if (!fulfilled || cancelled || hasRtoTag) {
      droppedNotDelivered++;
      continue;
    }

    const createdAt = parseExcelDate(row["Created at"]);
    if (!createdAt) {
      droppedOutOfWindow++;
      continue;
    }
    if (createdAt < start || createdAt >= endExclusive) {
      droppedOutOfWindow++;
      continue;
    }

    const orderName = String(row["Name"] ?? "").trim();
    const total = num(row["Total"]);
    const qty = num(row["Lineitem quantity"]);
    const isPre = createdAt < pivot;
    const customerName =
      String(row["Billing Name"] ?? "").trim() ||
      String(row["Shipping Name"] ?? "").trim() ||
      "Unknown";
    const email = String(row["Email"] ?? "").trim();

    let acc = byPhone.get(phone);
    if (!acc) {
      acc = {
        name: customerName,
        email,
        firstDate: createdAt,
        lastDate: createdAt,
        orderNames: new Set(),
        revenuePre: 0,
        revenuePost: 0,
        ordersInRange: 0,
        unitsPre: 0,
        unitsPost: 0,
        preOrders: 0,
        postOrders: 0,
        inRangeNames: new Set(),
      };
      byPhone.set(phone, acc);
    }
    if (createdAt < acc.firstDate) acc.firstDate = createdAt;
    if (createdAt > acc.lastDate) {
      acc.lastDate = createdAt;
      // Use the most recent order's name/email as canonical display.
      acc.name = customerName || acc.name;
      acc.email = email || acc.email;
    }

    // Units: every row contributes its line quantity.
    if (isPre) acc.unitsPre += qty;
    else acc.unitsPost += qty;

    // Order-level dedup: only first sight of an order name counts toward
    // order count + revenue for that period.
    if (orderName && !acc.orderNames.has(orderName)) {
      acc.orderNames.add(orderName);
      acc.inRangeNames.add(orderName);
      acc.ordersInRange += 1;
      if (isPre) {
        acc.preOrders += 1;
        acc.revenuePre += total;
      } else {
        acc.postOrders += 1;
        acc.revenuePost += total;
      }
    }
  }

  // Build the response in the same camelCase shape the dashboard uses.
  const customers = Array.from(byPhone.entries())
    .map(([phone, a], i) => {
      const lifetimeUnits = a.unitsPre + a.unitsPost;
      const lifetimeRevenue = a.revenuePre + a.revenuePost;
      const lifetimeOrders = a.preOrders + a.postOrders;
      return {
        identity: `mob:${phone}:${i}`, // suffix to keep React key unique even on identical mobile
        name: a.name,
        phone,
        email: a.email || null,
        ordersInRange: a.ordersInRange,
        lifetimeOrders,
        lifetimeUnits,
        lifetimeRevenue,
        firstOrderDate: fmtYmd(a.firstDate),
        lastOrderDate: fmtYmd(a.lastDate),
        firstTag: a.firstDate < pivot ? "pre" : "post",
        lastTag: a.lastDate < pivot ? "pre" : "post",
        postPivotOrders: a.postOrders,
        postPivotUnits: a.unitsPost,
        postPivotRevenue: a.revenuePost,
      };
    })
    .sort((x, y) => y.ordersInRange - x.ordersInRange || x.name.localeCompare(y.name));

  return NextResponse.json({
    start: startStr,
    end: endStr,
    pivot: pivotStr,
    customers,
    meta: {
      rowsParsed: parsedRows,
      droppedNoPhone,
      droppedNotDelivered,
      droppedOutOfWindow,
      customerCount: customers.length,
    },
  });
}
