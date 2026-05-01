import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Lightweight ping endpoint to keep Neon awake.
// Hit this every 4 minutes from cron-job.org so the database
// never goes to sleep (Neon free tier sleeps after 5 min idle).
//
// Public endpoint (no auth) — only does a SELECT 1, can't be abused.
export const maxDuration = 30;

export async function GET() {
  try {
    // Tiny query — wakes Neon if it was sleeping, succeeds quickly otherwise
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
