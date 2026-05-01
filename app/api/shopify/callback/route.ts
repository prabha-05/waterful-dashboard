import { NextRequest, NextResponse } from "next/server";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const stateParam = params.get("state");
  const shop = params.get("shop");
  const stateCookie = req.cookies.get("shopify_oauth_state")?.value;

  if (!code || !stateParam || !shop) {
    return NextResponse.json(
      { error: "Missing code, state, or shop in callback" },
      { status: 400 }
    );
  }
  if (stateCookie !== stateParam) {
    return NextResponse.json(
      { error: "OAuth state mismatch — possible CSRF" },
      { status: 400 }
    );
  }
  if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) {
    return NextResponse.json({ error: "Invalid shop domain" }, { status: 400 });
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Server missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET" },
      { status: 500 }
    );
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return new NextResponse(
      `<html><body style="font-family:system-ui;max-width:720px;margin:48px auto;padding:24px;background:#fdfaf4;color:#4a3a2e">
        <h1 style="color:#d97777">Token exchange failed</h1>
        <p>Shopify rejected the code exchange. Response:</p>
        <pre style="background:#f1e7d3;padding:16px;border-radius:8px;white-space:pre-wrap;word-break:break-word">${escapeHtml(errText)}</pre>
        <p>Common causes: redirect URI not whitelisted in the app, expired code, or wrong client secret.</p>
      </body></html>`,
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    scope: string;
  };

  const html = `<!DOCTYPE html>
<html><head><title>Shopify Connected</title>
<style>
  body{font-family:system-ui;max-width:720px;margin:48px auto;padding:24px;background:#fdfaf4;color:#4a3a2e}
  h1{color:#7a9471;margin:0 0 8px}
  .box{background:white;padding:24px;border-radius:12px;border:1px solid #e8dfd0;margin:16px 0}
  .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9a8571;margin-bottom:6px}
  code{background:#f1e7d3;padding:10px 14px;border-radius:6px;display:block;font-size:13px;word-break:break-all;font-family:ui-monospace,monospace;color:#4a3a2e}
  .warn{background:#fff4e0;padding:14px 18px;border-radius:8px;border:1px solid #c99954;margin:20px 0;font-size:14px}
  .warn strong{color:#7a5818}
  ol{padding-left:20px;line-height:1.7}
  a{color:#7a9471;font-weight:600}
</style></head>
<body>
<h1>✓ Shopify connected</h1>
<p style="color:#9a8571;margin:0 0 24px">Admin API access token issued for <strong>${escapeHtml(shop)}</strong></p>

<div class="box">
  <div class="label">Access Token</div>
  <code>${escapeHtml(tokenData.access_token)}</code>
  <div class="label" style="margin-top:16px">Granted Scopes</div>
  <code>${escapeHtml(tokenData.scope)}</code>
</div>

<div class="warn">
  <strong>One step left to make this work:</strong>
  <ol>
    <li>Open <code style="display:inline;padding:2px 6px">.env</code> in your editor</li>
    <li>Replace the existing <code style="display:inline;padding:2px 6px">SHOPIFY_ACCESS_TOKEN="..."</code> line with:<br/>
      <code style="margin-top:8px">SHOPIFY_ACCESS_TOKEN="${escapeHtml(tokenData.access_token)}"</code>
    </li>
    <li>Save the file, then restart the dev server (Ctrl+C → <code style="display:inline;padding:2px 6px">npm run dev</code>)</li>
    <li>Visit <a href="/dashboard/admin/import">/dashboard/admin/import</a> to run your first sync</li>
  </ol>
</div>
</body></html>`;

  const res = new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  res.cookies.delete("shopify_oauth_state");
  return res;
}
