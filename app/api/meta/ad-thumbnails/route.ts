import { NextRequest, NextResponse } from "next/server";
import { fetchAdThumbnailsBatch } from "@/lib/meta";

// Returns fresh Meta CDN thumbnail URLs for a list of ad IDs.
//
// Why this exists: thumbnail URLs cached in our DB are signed with a
// short-lived token (`_nc_ohc=...`) that expires within hours. Loading
// them into <img> after expiry shows a broken image. This endpoint
// re-asks Meta for live URLs at view time.
//
// Usage: GET /api/meta/ad-thumbnails?ids=120123,120456,120789
// Returns: { "120123": "https://...", "120456": null, ... }
//
// Meta caps ?ids= at 50, so we chunk transparently.

const BATCH = 50;

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({ error: "Missing ?ids" }, { status: 400 });
  }

  const ids = Array.from(
    new Set(
      idsParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s)),
    ),
  );
  if (ids.length === 0) {
    return NextResponse.json({});
  }

  const merged: Record<string, string | null> = {};
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    try {
      const batch = await fetchAdThumbnailsBatch(chunk);
      Object.assign(merged, batch);
    } catch (e) {
      // One bad chunk shouldn't kill the whole response — log and keep
      // the corresponding ids as null so the UI falls back gracefully.
      console.error("meta thumbnail batch failed", e);
      for (const id of chunk) merged[id] = null;
    }
  }

  return NextResponse.json(merged, {
    headers: {
      // Fresh URLs are valid for ~hours; allow browsers to reuse this
      // proxy response for 15 minutes within the same session.
      "Cache-Control": "private, max-age=900",
    },
  });
}
