import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

type Row = {
  month: string;
  duplicate: number;
  orderId: number;
  date: Date;
  flavour: string;
  qty: number;
  customerName: string;
  mobile: string;
  billingCity: string;
  pincode: string;
  billingState: string;
  total: number;
  status: string;
  paymentMethod: string | null;
};

function parseCsv(raw: string): { rows: Row[]; skipped: number; errors: string[] } {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  let skipped = 0;
  const rows: Row[] = [];

  const dataLines = lines.slice(1);
  for (let idx = 0; idx < dataLines.length; idx++) {
    const line = dataLines[idx];
    const cols = line.split(",");
    if (cols.length < 13) {
      skipped++;
      if (errors.length < 5) errors.push(`Line ${idx + 2}: only ${cols.length} columns`);
      continue;
    }
    const total = parseFloat(cols[11]) || 0;
    const qty = parseInt(cols[5]) || 0;
    const dateStr = cols[3]?.trim();
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) date.setTime(0);

    rows.push({
      month: cols[0]?.trim() || "",
      duplicate: parseInt(cols[1]) || 1,
      orderId: parseInt(cols[2]) || 0,
      date,
      flavour: cols[4]?.trim() || "",
      qty,
      customerName: cols[6]?.trim() || "",
      mobile: cols[7]?.trim() || "",
      billingCity: cols[8]?.trim() || "",
      pincode: cols[9]?.trim() || "",
      billingState: cols[10]?.trim() || "",
      total,
      status: cols[12]?.trim() || "Unknown",
      paymentMethod: cols[13]?.trim() || null,
    });
  }
  return { rows, skipped, errors };
}

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_UPLOAD_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "Server missing ADMIN_UPLOAD_PASSWORD env var" },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const password = String(formData.get("password") || "");
  if (password !== expected) {
    return NextResponse.json({ error: "Invalid admin password" }, { status: 401 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 50MB limit" }, { status: 400 });
  }

  const dryRun = String(formData.get("dryRun") || "") === "true";

  const raw = await file.text();
  const { rows, skipped, errors } = parseCsv(raw);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found in CSV", skipped, errors },
      { status: 400 },
    );
  }

  const totalRevenue = rows.reduce((s, r) => s + r.total, 0);
  const uniqueOrderIds = new Set(rows.map((r) => r.orderId)).size;
  const uniqueMobiles = new Set(rows.map((r) => r.mobile).filter(Boolean)).size;
  const currentCount = await prisma.salesOrder.count();

  const preview = {
    fileName: file.name,
    fileSize: file.size,
    currentRows: currentCount,
    newRows: rows.length,
    skipped,
    errors,
    uniqueOrderIds,
    uniqueCustomers: uniqueMobiles,
    totalRevenue: Math.round(totalRevenue),
    firstDate: rows
      .map((r) => r.date)
      .reduce((min, d) => (d < min ? d : min), rows[0].date)
      .toISOString(),
    lastDate: rows
      .map((r) => r.date)
      .reduce((max, d) => (d > max ? d : max), rows[0].date)
      .toISOString(),
    sample: rows.slice(0, 3).map((r) => ({
      orderId: r.orderId,
      date: r.date.toISOString(),
      flavour: r.flavour,
      customerName: r.customerName,
      total: r.total,
    })),
  };

  if (dryRun) {
    return NextResponse.json({ dryRun: true, preview });
  }

  const startedAt = new Date();
  try {
    await prisma.salesOrder.deleteMany();
    const chunkSize = 1000;
    for (let i = 0; i < rows.length; i += chunkSize) {
      await prisma.salesOrder.createMany({ data: rows.slice(i, i + chunkSize) });
    }
    await prisma.syncLog.create({
      data: {
        startedAt,
        completedAt: new Date(),
        status: "success",
        ordersAdded: rows.length,
      },
    });
    return NextResponse.json({ ok: true, inserted: rows.length, preview });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await prisma.syncLog.create({
      data: {
        startedAt,
        completedAt: new Date(),
        status: "failed",
        error: message,
      },
    });
    return NextResponse.json({ error: `Import failed: ${message}` }, { status: 500 });
  }
}
