import { NextRequest, NextResponse } from "next/server";
import { computeMonthlyRetention } from "@/lib/retention-monthly";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to params required" }, { status: 400 });
  }

  const start = new Date(from);
  const end = new Date(to);
  end.setDate(end.getDate() + 1);

  const rows = await computeMonthlyRetention(start, end);
  return NextResponse.json({ from, to, rows });
}
