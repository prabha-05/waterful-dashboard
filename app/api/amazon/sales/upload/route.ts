import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Accepts the Sales Dashboard CSV exported from Seller Central. The CSV
// has several stacked sections; the section we want is "Compare Sales -
// Graph view" — a per-date table:
//
//   Time,Selected date range (Ordered product sales),Selected date range
//   (Units ordered),Same date range one year ago (Ordered product sales),
//   Same date range one year ago (Units ordered)
//   2026-05-25T00:00:00,"₹810.00",1.0,"₹2,065.00",4.0
//   ...
//
// Re-uploading the same date is idempotent — `upsert` by the date PK.

const SECTION_HEADER = "Compare Sales - Graph view";
const TABLE_END = "Compare Sales - Table view";

// "₹810.00" -> 810, "₹2,065.00" -> 2065, "₹0.00" -> 0
function parseCurrency(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseNumber(raw: string): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Tab-aware, quote-respecting CSV row splitter — Amazon wraps currency
// cells in quotes because they contain commas (₹2,065.00).
function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseIstDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const raw = await file.text();
  // Strip a BOM if present (Amazon exports with UTF-8 BOM).
  const text = raw.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);

  // Find the daily table inside the stacked CSV.
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(SECTION_HEADER)) start = i;
    else if (start !== -1 && lines[i].includes(TABLE_END)) {
      end = i;
      break;
    }
  }
  if (start === -1) {
    return NextResponse.json(
      { error: "Could not find 'Compare Sales - Graph view' section. Is this the Sales Dashboard CSV?" },
      { status: 400 },
    );
  }
  if (end === -1) end = lines.length;

  // start+1 is the column header row; data begins at start+2.
  // Amazon emits HOURLY rows when the export window is short (e.g.
  // last 2 days). Multiple rows per calendar day must be summed
  // before upsert; otherwise the last hour's values would clobber
  // earlier ones (since the date column is the table's primary key).
  type Aggregate = { date: Date; revenue: number; units: number; yoyRevenue: number; yoyUnits: number; hadYoy: boolean };
  const byDate = new Map<string, Aggregate>();
  for (let i = start + 2; i < end; i++) {
    const cols = splitCsvRow(lines[i]);
    if (cols.length < 3) continue;
    const date = parseIstDate(cols[0]);
    if (!date) continue;
    const key = date.toISOString().slice(0, 10);
    const revenue = parseCurrency(cols[1]);
    const units = parseNumber(cols[2]);
    const yoyRevenue = cols[3] !== undefined ? parseCurrency(cols[3]) : 0;
    const yoyUnits = cols[4] !== undefined ? parseNumber(cols[4]) : 0;
    const hasYoyCol = cols[3] !== undefined || cols[4] !== undefined;
    const existing = byDate.get(key);
    if (existing) {
      existing.revenue += revenue;
      existing.units += units;
      existing.yoyRevenue += yoyRevenue;
      existing.yoyUnits += yoyUnits;
      existing.hadYoy = existing.hadYoy || hasYoyCol;
    } else {
      byDate.set(key, { date, revenue, units, yoyRevenue, yoyUnits, hadYoy: hasYoyCol });
    }
  }
  const rows = Array.from(byDate.values())
    .map((a) => ({
      date: a.date,
      revenue: a.revenue,
      units: a.units,
      yoyRevenue: a.hadYoy ? a.yoyRevenue : null,
      yoyUnits: a.hadYoy ? a.yoyUnits : null,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (rows.length === 0) {
    return NextResponse.json({ error: "No daily rows parsed from the CSV." }, { status: 400 });
  }

  // Upsert each row. Single-row upserts are fine for this volume (<400 days
  // per upload). If file sizes ever grow, swap to a raw bulk-upsert SQL.
  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const existing = await prisma.amazonDailySales.findUnique({ where: { date: r.date } });
    await prisma.amazonDailySales.upsert({
      where: { date: r.date },
      create: { date: r.date, revenue: r.revenue, units: r.units, yoyRevenue: r.yoyRevenue, yoyUnits: r.yoyUnits },
      update: { revenue: r.revenue, units: r.units, yoyRevenue: r.yoyRevenue, yoyUnits: r.yoyUnits },
    });
    if (existing) updated++;
    else inserted++;
  }

  const minDate = rows[0].date.toISOString().slice(0, 10);
  const maxDate = rows[rows.length - 1].date.toISOString().slice(0, 10);
  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const totalUnits = rows.reduce((a, r) => a + r.units, 0);

  return NextResponse.json({
    ok: true,
    rowsParsed: rows.length,
    inserted,
    updated,
    dateRange: { from: minDate, to: maxDate },
    totals: { revenue: totalRevenue, units: totalUnits },
  });
}
