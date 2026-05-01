import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// One-shot housekeeping: marks all stuck "running" SyncLog rows as "failed"
// so a fresh sync can start. Used when concurrent sync attempts left rows
// stuck without a completedAt.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await prisma.syncLog.updateMany({
    where: { status: "running" },
    data: {
      status: "failed",
      completedAt: new Date(),
      error: "Manually reset (concurrent-sync recovery)",
    },
  });

  return NextResponse.json({
    cleared: result.count,
    message: `Marked ${result.count} stuck running sync(s) as failed`,
  });
}
