import { NextResponse } from "next/server";

// Diagnostic: check what timezone the Vercel function is running in.
// Should report Asia/Kolkata after we set TZ env var.
export async function GET() {
  const now = new Date();
  return NextResponse.json({
    nowIso: now.toISOString(),
    nowLocal: now.toString(),
    tzEnv: process.env.TZ ?? "(not set)",
    tzIntl: Intl.DateTimeFormat().resolvedOptions().timeZone,
    nowYearMonthDay: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      date: now.getDate(),
      hours: now.getHours(),
      minutes: now.getMinutes(),
    },
  });
}
