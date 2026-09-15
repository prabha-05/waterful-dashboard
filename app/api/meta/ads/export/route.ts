import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { startOfIstDay, addDays, formatIstYmd } from "@/lib/timezone";

// Downloads every ad with spend in the window as an .xlsx — one row per ad,
// every metric the dashboard has, plus the live Instagram/Facebook post link
// and an Ads Manager deep link. Backs the "Download report" button on the
// Meta Ads page so the team can pull the report themselves at any time.
//
// Session-gated: this is a full export of the account, not a dashboard read.
export const maxDuration = 60;

const ACCOUNT = (process.env.META_AD_ACCOUNT_ID ?? "").replace(/^act_/, "");

function parseYmdToIstDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS);
}

const isDelivering = (status: string, eff: string | null) =>
  status === "ACTIVE" && !["ADSET_PAUSED", "CAMPAIGN_PAUSED", "WITH_ISSUES"].includes(eff ?? "");

// Same bucketing the page uses for its Video / Image / Carousel pills.
const normalizeFormat = (t: string | null): "video" | "carousel" | "image" => {
  const raw = (t ?? "").toLowerCase();
  if (raw === "video") return "video";
  if (raw === "carousel") return "carousel";
  return "image";
};

const pct = (num: number, den: number, dp = 2) => (den > 0 ? +((num / den) * 100).toFixed(dp) : "");
const per = (num: number, den: number) => (den > 0 ? Math.round(num / den) : "");

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayIst = startOfIstDay(new Date());
  const defaultTo = addDays(todayIst, -1);
  const defaultFrom = addDays(defaultTo, -6);
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const from = fromParam ? parseYmdToIstDay(fromParam) : defaultFrom;
  const to = toParam ? parseYmdToIstDay(toParam) : defaultTo;
  if (!from || !to || from > to) {
    return NextResponse.json({ error: "from/to must be YYYY-MM-DD and from <= to" }, { status: 400 });
  }
  const toExclusive = addDays(to, 1);

  // Optional filters, mirroring the page so the download matches the table.
  const minSpend = Math.max(0, Number(req.nextUrl.searchParams.get("minSpend") ?? 0) || 0);
  const formatParam = req.nextUrl.searchParams.get("format") ?? "ALL";
  const statusParam = req.nextUrl.searchParams.get("status") ?? "ALL";

  const rows = await prisma.metaAdDaily.findMany({
    where: { date: { gte: from, lt: toExclusive } },
    include: {
      ad: {
        select: {
          metaAdId: true,
          name: true,
          creativeType: true,
          status: true,
          effectiveStatus: true,
          previewLink: true,
          adSet: { select: { name: true, metaCampaignId: true } },
        },
      },
    },
  });

  const campaignIds = Array.from(new Set(rows.map((r) => r.ad.adSet.metaCampaignId)));
  const campaigns = await prisma.metaCampaign.findMany({
    where: { metaCampaignId: { in: campaignIds } },
    select: { metaCampaignId: true, name: true },
  });
  const campaignName = new Map(campaigns.map((c) => [c.metaCampaignId, c.name]));

  // Aggregate per ad
  type Agg = {
    id: string; name: string; ct: string | null; status: string; eff: string | null; link: string | null;
    adset: string; campaign: string;
    sp: number; im: number; rch: number; ck: number; lpv: number; atc: number; ic: number; pu: number; rv: number;
    v3: number; v25: number; v50: number; v75: number; v100: number; freqW: number; days: Set<string>;
    first: Date; last: Date;
  };
  const byAd = new Map<string, Agg>();
  for (const r of rows) {
    const key = r.ad.metaAdId;
    let a = byAd.get(key);
    if (!a) {
      a = {
        id: key, name: r.ad.name, ct: r.ad.creativeType, status: r.ad.status, eff: r.ad.effectiveStatus, link: r.ad.previewLink,
        adset: r.ad.adSet.name, campaign: campaignName.get(r.ad.adSet.metaCampaignId) ?? "",
        sp: 0, im: 0, rch: 0, ck: 0, lpv: 0, atc: 0, ic: 0, pu: 0, rv: 0, v3: 0, v25: 0, v50: 0, v75: 0, v100: 0, freqW: 0,
        days: new Set(), first: r.date, last: r.date,
      };
      byAd.set(key, a);
    }
    a.sp += r.spend; a.im += r.impressions; a.rch += r.reach; a.ck += r.clicks;
    a.lpv += r.landingPageViews; a.atc += r.addToCart; a.ic += r.initiateCheckout; a.pu += r.purchases; a.rv += r.purchaseValue;
    a.v3 += r.video3sViews; a.v25 += r.video25pViews; a.v50 += r.video50pViews; a.v75 += r.videoP75Views; a.v100 += r.video100pViews;
    a.freqW += r.frequency * r.impressions;
    a.days.add(formatIstYmd(r.date));
    if (r.date < a.first) a.first = r.date;
    if (r.date > a.last) a.last = r.date;
  }

  const ads = Array.from(byAd.values())
    .filter((a) => a.sp > 0)
    .filter((a) => a.sp >= minSpend)
    .filter((a) => formatParam === "ALL" || normalizeFormat(a.ct) === formatParam)
    .filter((a) => {
      if (statusParam === "ALL") return true;
      const live = isDelivering(a.status, a.eff);
      return statusParam === "running" ? live : !live;
    })
    .sort((a, b) => b.sp - a.sp);
  const fromYmd = formatIstYmd(from);
  const toYmd = formatIstYmd(to);

  const out = ads.map((a) => ({
    "Ad": a.name,
    "Ad set": a.adset,
    "Campaign": a.campaign,
    "Format": a.ct ?? "",
    "Running now": isDelivering(a.status, a.eff) ? "Yes" : "No",
    "First day": formatIstYmd(a.first),
    "Last day": formatIstYmd(a.last),
    "Days live": a.days.size,
    "Spend (INR)": Math.round(a.sp),
    "Impressions": a.im,
    "Reach (summed daily)": a.rch,
    "Frequency": a.im > 0 ? +(a.freqW / a.im).toFixed(2) : "",
    "CPM (INR)": a.im > 0 ? Math.round((a.sp / a.im) * 1000) : "",
    "Clicks": a.ck,
    "CTR %": pct(a.ck, a.im),
    "CPC (INR)": per(a.sp, a.ck),
    "Landing page views": a.lpv,
    "Click to page %": pct(a.lpv, a.ck, 1),
    "Add to cart": a.atc,
    "Page to cart %": pct(a.atc, a.lpv, 1),
    "Checkout started": a.ic,
    "Cart to checkout %": pct(a.ic, a.atc, 1),
    "Purchases": a.pu,
    "Checkout to purchase %": pct(a.pu, a.ic, 1),
    "Purchase value (INR)": Math.round(a.rv),
    "ROAS": a.sp > 0 ? +(a.rv / a.sp).toFixed(2) : "",
    "Cost per purchase (INR)": per(a.sp, a.pu),
    "Cost per add-to-cart (INR)": per(a.sp, a.atc),
    "3s video views": a.v3,
    "Hook rate % (3s/impr)": pct(a.v3, a.im, 1),
    "25% views": a.v25,
    "50% views": a.v50,
    "75% views": a.v75,
    "100% views": a.v100,
    "ThruPlay % (100%/3s)": pct(a.v100, a.v3, 1),
    "View ad": a.link ?? "",
    "Ads Manager": `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${ACCOUNT}&selected_ad_ids=${a.id}&date=${fromYmd}_${toYmd}`,
  }));

  const T = ads.reduce(
    (t, a) => ({ sp: t.sp + a.sp, pu: t.pu + a.pu, rv: t.rv + a.rv, im: t.im + a.im, ck: t.ck + a.ck }),
    { sp: 0, pu: 0, rv: 0, im: 0, ck: 0 },
  );

  const wb = XLSX.utils.book_new();
  const summary = [
    ["Waterful Zero — Meta ads report"],
    ["Period", `${fromYmd} to ${toYmd}`],
    ["Generated", new Date().toISOString()],
    ["Filters", [
      minSpend > 0 ? `spend > ${minSpend}` : "any spend",
      formatParam === "ALL" ? "all formats" : formatParam,
      statusParam === "ALL" ? "running and paused" : statusParam,
    ].join(" · ")],
    [],
    ["Ads with spend", ads.length],
    ["Total spend (INR)", Math.round(T.sp)],
    ["Purchases", T.pu],
    ["Attributed revenue (INR)", Math.round(T.rv)],
    ["ROAS", T.sp > 0 ? +(T.rv / T.sp).toFixed(2) : ""],
    ["Cost per purchase (INR)", per(T.sp, T.pu)],
    ["CTR %", pct(T.ck, T.im)],
    ["CPM (INR)", T.im > 0 ? Math.round((T.sp / T.im) * 1000) : ""],
    ["Running now", ads.filter((a) => isDelivering(a.status, a.eff)).length],
    [],
    ["Notes"],
    ["ROAS and purchases are Meta Pixel attribution, which undercounts Shopify by roughly a quarter."],
    ["Reach is summed daily reach: it counts a person once per day, so it overstates unique reach."],
    ["View ad opens the live Instagram or Facebook post and works for anyone. Ads Manager needs access to the ad account."],
  ];
  const ws0 = XLSX.utils.aoa_to_sheet(summary);
  ws0["!cols"] = [{ wch: 28 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws0, "Summary");

  const ws = XLSX.utils.json_to_sheet(out);
  const headers = out.length ? Object.keys(out[0]) : [];
  ws["!cols"] = headers.map((k) => ({
    wch: k === "Ad" ? 46 : k === "Ad set" || k === "Campaign" ? 32 : k === "View ad" || k === "Ads Manager" ? 44 : Math.max(9, Math.min(22, k.length + 2)),
  }));
  ws["!freeze"] = { xSplit: 1, ySplit: 1 };
  if (out.length) {
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: out.length, c: headers.length - 1 } }) };
    // Make the two link columns clickable rather than plain text.
    const viewCol = headers.indexOf("View ad");
    const mgrCol = headers.indexOf("Ads Manager");
    out.forEach((row, i) => {
      for (const c of [viewCol, mgrCol]) {
        const addr = XLSX.utils.encode_cell({ r: i + 1, c });
        const cell = ws[addr];
        if (cell && typeof cell.v === "string" && cell.v.startsWith("http")) {
          cell.l = { Target: cell.v };
        }
      }
    });
  }
  XLSX.utils.book_append_sheet(wb, ws, "All ads");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `Waterful Meta Ads ${fromYmd} to ${toYmd}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
