import { NextRequest, NextResponse } from "next/server";
import { computeCohorts } from "@/lib/retention-cohorts";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to params required" }, { status: 400 });
  }

  const start = new Date(from);
  const end = new Date(to);
  end.setDate(end.getDate() + 1);

  const { cohorts, productCohorts } = await computeCohorts(start, end);
  return NextResponse.json({ from, to, cohorts, productCohorts });
}
