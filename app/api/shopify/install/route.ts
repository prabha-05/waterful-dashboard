import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  const shop = process.env.SHOPIFY_STORE_URL;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const scopes = process.env.SHOPIFY_SCOPES;

  if (!shop || !clientId || !scopes) {
    return NextResponse.json(
      {
        error:
          "Missing env vars. Need SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID, SHOPIFY_SCOPES.",
      },
      { status: 500 }
    );
  }

  const redirectUri = `${req.nextUrl.origin}/api/shopify/callback`;
  const state = randomBytes(16).toString("hex");

  const installUrl =
    `https://${shop}/admin/oauth/authorize?` +
    `client_id=${clientId}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  const res = NextResponse.redirect(installUrl);
  res.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
