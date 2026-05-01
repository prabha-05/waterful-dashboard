import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// One-shot housekeeping endpoint:
//   1. Marks all stuck "running" SyncLog rows as "failed"
//   2. If ?checkpoint=ISO_TIMESTAMP is provided, creates a synthetic "completed"
//      SyncLog row with completedAt set to that timestamp. The NEXT sync run
//      then uses this as its sinceDate → fetches only orders updated after
//      that point → finishes in seconds even on Vercel Hobby's 60s limit.
//
// Useful for recovering from a broken state where no "completed" SyncLog
// exists, forcing every sync to do a slow full fetch.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cleared = await prisma.syncLog.updateMany({
    where: { status: "running" },
    data: {
      status: "failed",
      completedAt: new Date(),
      error: "Manually reset (concurrent-sync recovery)",
    },
  });

  const checkpointParam = req.nextUrl.searchParams.get("checkpoint");
  let checkpointCreated = false;
  if (checkpointParam) {
    const checkpointDate = new Date(checkpointParam);
    if (!isNaN(checkpointDate.getTime())) {
      await prisma.syncLog.create({
        data: {
          status: "completed",
          startedAt: checkpointDate,
          completedAt: checkpointDate,
          ordersAdded: 0,
          ordersUpdated: 0,
          error: "Synthetic checkpoint — bootstraps incremental sync",
        },
      });
      checkpointCreated = true;
    }
  }

  return NextResponse.json({
    cleared: cleared.count,
    checkpointCreated,
    message: `Marked ${cleared.count} stuck running sync(s) as failed${
      checkpointCreated ? ` and seeded checkpoint at ${checkpointParam}` : ""
    }`,
  });
}
