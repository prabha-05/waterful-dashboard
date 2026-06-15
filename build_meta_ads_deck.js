/* eslint-disable */
// Generates a PowerPoint deck for May 1 – Jun 11, 2026 Meta ads
// performance, with embedded ad thumbnails fetched fresh from Meta.
//
//   node build_meta_ads_deck.js
//
// Writes waterful_meta_ads_may1_to_jun11.pptx to the project root.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const PptxGenJS = require("pptxgenjs");
const { PrismaClient } = require("@prisma/client");

const TOKEN = process.env.META_ACCESS_TOKEN;
const META_VERSION = process.env.META_API_VERSION ?? "v22.0";
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

if (!TOKEN) {
  console.error("Missing META_ACCESS_TOKEN in .env");
  process.exit(1);
}

const INK = "4a3a2e";
const MUTED = "9a8571";
const AMBER = "c99954";
const SAGE = "7a9471";
const ROSE = "d97777";
const BLUE = "7c8bb2";
const CREAM = "faf6ef";
const BORDER = "e8dfd0";

const THUMB_DIR = path.join(__dirname, ".tmp-thumbnails");
fs.mkdirSync(THUMB_DIR, { recursive: true });

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────
// Pull top ads from Neon (May 1 → Jun 11)
// ─────────────────────────────────────────────────────────────────────
async function loadAds() {
  const start = new Date("2026-05-01T00:00:00+05:30");
  const end = new Date("2026-06-12T00:00:00+05:30");
  const rows = await prisma.metaAdDaily.findMany({
    where: { date: { gte: start, lt: end } },
    select: {
      adId: true, spend: true, impressions: true, clicks: true,
      purchases: true, purchaseValue: true, video3sViews: true,
      videoP75Views: true, frequency: true,
      ad: { select: { metaAdId: true, name: true, thumbnailUrl: true } },
    },
  });
  const byAd = new Map();
  for (const r of rows) {
    if (!byAd.has(r.adId)) {
      byAd.set(r.adId, {
        adId: r.adId,
        metaAdId: r.ad.metaAdId,
        name: r.ad.name,
        storedThumb: r.ad.thumbnailUrl,
        spend: 0, impressions: 0, clicks: 0, purchases: 0,
        purchaseValue: 0, video3sViews: 0, videoP75Views: 0,
        freqSum: 0, freqDays: 0,
      });
    }
    const a = byAd.get(r.adId);
    a.spend += r.spend;
    a.impressions += r.impressions;
    a.clicks += r.clicks;
    a.purchases += r.purchases;
    a.purchaseValue += r.purchaseValue;
    a.video3sViews += r.video3sViews ?? 0;
    a.videoP75Views += r.videoP75Views ?? 0;
    if (r.frequency > 0) { a.freqSum += r.frequency; a.freqDays++; }
  }
  return [...byAd.values()].map((a) => ({
    ...a,
    roas: a.spend > 0 ? a.purchaseValue / a.spend : 0,
    ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
    cpa: a.purchases > 0 ? a.spend / a.purchases : 0,
    hookRate: a.impressions > 0 ? (a.video3sViews / a.impressions) * 100 : 0,
    avgFreq: a.freqDays > 0 ? a.freqSum / a.freqDays : 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Pick top 5 lists for each metric
// ─────────────────────────────────────────────────────────────────────
function pickTops(ads) {
  const min1k = (a) => a.spend >= 1000;
  const min3k = (a) => a.spend >= 3000;
  const min5k = (a) => a.spend >= 5000;

  return {
    spend:     [...ads].filter(min1k).sort((a, b) => b.spend - a.spend).slice(0, 5),
    roas:      [...ads].filter(min5k).sort((a, b) => b.roas - a.roas).slice(0, 5),
    purchases: [...ads].filter(min1k).sort((a, b) => b.purchases - a.purchases).slice(0, 5),
    ctr:       [...ads].filter(min3k).sort((a, b) => b.ctr - a.ctr).slice(0, 5),
    hook:      [...ads].filter(min3k).sort((a, b) => b.hookRate - a.hookRate).slice(0, 5),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Fetch fresh thumbnail URLs from Meta (batched, 50 ids per call)
// ─────────────────────────────────────────────────────────────────────
async function fetchFreshThumbUrls(metaAdIds) {
  const out = new Map();
  for (let i = 0; i < metaAdIds.length; i += 50) {
    const chunk = metaAdIds.slice(i, i + 50);
    const url = `${META_BASE}/?ids=${encodeURIComponent(chunk.join(","))}&fields=creative{thumbnail_url,image_url}&access_token=${TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  Meta batch fetch failed: HTTP ${res.status}`);
      continue;
    }
    const json = await res.json();
    for (const id of chunk) {
      const c = json[id]?.creative;
      out.set(id, c?.thumbnail_url || c?.image_url || null);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Download each thumbnail JPEG to .tmp-thumbnails/<metaAdId>.jpg
// ─────────────────────────────────────────────────────────────────────
async function downloadThumbs(thumbMap) {
  const paths = new Map();
  for (const [id, url] of thumbMap) {
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const file = path.join(THUMB_DIR, `${id}.jpg`);
      fs.writeFileSync(file, buf);
      paths.set(id, file);
    } catch (err) {
      console.log(`  download failed for ${id}: ${err.message}`);
    }
  }
  return paths;
}

// ─────────────────────────────────────────────────────────────────────
// Build the deck
// ─────────────────────────────────────────────────────────────────────
function fmtSpend(n) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function roasColor(r) {
  return r >= 1.2 ? SAGE : r >= 1 ? AMBER : ROSE;
}

function buildDeck(tops, thumbPaths) {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Waterful Dashboard";
  pres.title = "Waterful — Meta Ads Performance · May 1 – Jun 11, 2026";

  pres.defineSlideMaster({
    title: "WATERFUL",
    background: { color: CREAM },
    margin: 0.4,
  });

  // Slide 1 — Title
  {
    const s = pres.addSlide({ masterName: "WATERFUL" });
    s.addText("Waterful — Meta Ads Performance", {
      x: 0.6, y: 2.2, w: 12, h: 0.9,
      fontSize: 40, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText("Top 5 ads across every aspect — with creative thumbnails", {
      x: 0.6, y: 3.2, w: 12, h: 0.6,
      fontSize: 22, color: AMBER, fontFace: "Calibri",
    });
    s.addText("May 1 – June 11, 2026   ·   ~6 weeks   ·   101 ads with activity", {
      x: 0.6, y: 4.0, w: 12, h: 0.5,
      fontSize: 16, color: MUTED, italic: true, fontFace: "Calibri",
    });
    s.addShape("rect", { x: 0.6, y: 4.7, w: 12, h: 0.04, fill: { color: BORDER } });
  }

  function topSlide(title, subtitle, rows, metricKey, fmtMetric, callout, calloutColor) {
    const s = pres.addSlide({ masterName: "WATERFUL" });

    // Header
    s.addText(title, {
      x: 0.5, y: 0.25, w: 12.3, h: 0.5,
      fontSize: 24, bold: true, color: INK, fontFace: "Calibri",
    });
    s.addText(subtitle, {
      x: 0.5, y: 0.75, w: 12.3, h: 0.3,
      fontSize: 12, color: MUTED, italic: true, fontFace: "Calibri",
    });
    s.addShape("rect", { x: 0.5, y: 1.15, w: 12.3, h: 0.03, fill: { color: BORDER } });

    // Layout: 5 rows. Columns laid out to fit cleanly inside 12.3" usable.
    //   x=0.50  num(0.40)  thumb(0.90)  name(4.80)  metric(1.50)  spend(1.30)  roas(0.95)  purch(0.85)  edge at x=12.40, +0.40 margin
    // Total widths: 0.40 + 0.90 + 4.80 + 1.50 + 1.30 + 0.95 + 0.85 = 10.70
    // Starting x=0.50 -> ends at 11.20. Centered with extra margin to the right edge so nothing clips.
    const startX = 0.5;
    const startY = 1.25;
    const rowH = 0.70;
    const headerH = 0.34;
    // Columns sum to exactly 12.30" so the table fills the slide width
    // (slide is 13.33" wide; 0.5" margin on each side = 12.30" usable).
    const cols = [
      { key: "num",       w: 0.45, header: "#",          align: "center" },
      { key: "thumb",     w: 0.95, header: "Creative",   align: "left" },
      { key: "name",      w: 5.80, header: "Ad name",    align: "left" },
      { key: "metric",    w: 1.50, header: metricKey,    align: "right" },
      { key: "spend",     w: 1.25, header: "Spend",      align: "right" },
      { key: "roas",      w: 1.05, header: "ROAS",       align: "right" },
      { key: "purchases", w: 1.30, header: "Purch.",     align: "right" },
    ];
    const colX = (i) => startX + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
    const totalW = cols.reduce((s, c) => s + c.w, 0); // 11.30

    // Header row
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      s.addShape("rect", { x: colX(i), y: startY, w: c.w, h: headerH, fill: { color: INK } });
      s.addText(c.header, {
        x: colX(i) + 0.08, y: startY, w: c.w - 0.16, h: headerH,
        fontSize: 10, bold: true, color: "FFFFFF", fontFace: "Calibri",
        align: c.align, valign: "middle",
      });
    }

    // Data rows
    for (let i = 0; i < rows.length; i++) {
      const a = rows[i];
      const y = startY + headerH + i * rowH;
      // Full row background + bottom border line
      s.addShape("rect", {
        x: startX, y, w: totalW, h: rowH,
        fill: { color: "FFFFFF" },
        line: { color: BORDER, width: 0.5 },
      });

      // # number
      s.addText(String(i + 1), {
        x: colX(0), y, w: cols[0].w, h: rowH,
        fontSize: 16, bold: true, color: INK, fontFace: "Calibri",
        align: "center", valign: "middle",
      });

      // Thumbnail (square, max-fit)
      const thumbX = colX(1) + 0.04;
      const thumbY = y + 0.04;
      const thumbW = cols[1].w - 0.08;
      const thumbH = rowH - 0.08;
      const thumbFile = thumbPaths.get(a.metaAdId);
      if (thumbFile) {
        s.addImage({
          path: thumbFile, x: thumbX, y: thumbY, w: thumbW, h: thumbH,
          sizing: { type: "contain", w: thumbW, h: thumbH },
        });
      } else {
        s.addShape("rect", { x: thumbX, y: thumbY, w: thumbW, h: thumbH, fill: { color: BORDER } });
        s.addText("?", {
          x: colX(1), y, w: cols[1].w, h: rowH,
          fontSize: 14, color: MUTED, align: "center", valign: "middle",
        });
      }

      // Ad name — single-line, autofit shrinks if too long
      s.addText(a.name, {
        x: colX(2) + 0.08, y, w: cols[2].w - 0.16, h: rowH,
        fontSize: 11, color: INK, fontFace: "Calibri",
        align: "left", valign: "middle",
        autoFit: true,
        wrap: false,
      });

      // Metric (the highlighted one)
      s.addText(fmtMetric(a), {
        x: colX(3) + 0.08, y, w: cols[3].w - 0.16, h: rowH,
        fontSize: 13, bold: true, color: calloutColor, fontFace: "Calibri",
        align: "right", valign: "middle",
      });

      // Spend
      s.addText(fmtSpend(a.spend), {
        x: colX(4) + 0.08, y, w: cols[4].w - 0.16, h: rowH,
        fontSize: 11, color: INK, fontFace: "Calibri",
        align: "right", valign: "middle",
      });

      // ROAS
      s.addText(`${a.roas.toFixed(2)}x`, {
        x: colX(5) + 0.08, y, w: cols[5].w - 0.16, h: rowH,
        fontSize: 11, bold: true, color: roasColor(a.roas), fontFace: "Calibri",
        align: "right", valign: "middle",
      });

      // Purchases
      s.addText(String(a.purchases), {
        x: colX(6) + 0.08, y, w: cols[6].w - 0.16, h: rowH,
        fontSize: 11, color: INK, fontFace: "Calibri",
        align: "right", valign: "middle",
      });
    }

    // Callout immediately below the table — small gap so the page feels
    // dense without crowding. Table ends at startY + headerH + 5 * rowH
    // (1.25 + 0.34 + 3.50 = 5.09). Callout starts 0.15 below, h = 1.2,
    // ends at 6.44 — leaves ~1" bottom margin, no overflow.
    if (callout) {
      const calloutY = startY + headerH + rows.length * rowH + 0.15;
      s.addShape("roundRect", {
        x: 0.5, y: calloutY, w: 12.3, h: 1.2,
        fill: { color: calloutColor, transparency: 88 },
        line: { color: calloutColor, width: 1 },
        rectRadius: 0.08,
      });
      s.addText([
        { text: "💡 What this means:  ", options: { bold: true, color: INK, fontSize: 12 } },
        { text: callout, options: { color: INK, fontSize: 12 } },
      ], {
        x: 0.75, y: calloutY + 0.08, w: 11.8, h: 1.04,
        fontFace: "Calibri", valign: "top",
        paraSpaceAfter: 2,
      });
    }
  }

  topSlide(
    "Top 5 by Spend",
    "Where the money went — total spend in the window",
    tops.spend,
    "Spend",
    (a) => fmtSpend(a.spend),
    "Roughly ₹5.4L went to the top 5 alone. Berry Cola creatives dominate the budget — 3 of 5 are Berry Cola variants. Healthy that spend leaders are also purchase leaders, but the concentration is a risk.",
    AMBER
  );

  topSlide(
    "Top 5 by ROAS",
    "Best return on every rupee spent (filtered to ≥ ₹5K spend)",
    tops.roas,
    "ROAS",
    (a) => `${a.roas.toFixed(2)}x`,
    "Static Berry Cola RTB2 — your most profitable ad. Double its budget tomorrow. BC_H2 launched Jun 9 is already a winner — watch and scale.",
    SAGE
  );

  topSlide(
    "Top 5 by Purchases",
    "Volume drivers — most orders attributed in the window",
    tops.purchases,
    "Purchases",
    (a) => String(a.purchases),
    "Spend and purchases line up — money is going to ads that work. Mixed Berries RTB has slightly better unit economics than Berry Cola PM at similar spend.",
    BLUE
  );

  topSlide(
    "Top 5 by CTR",
    "Best click-through rate (≥ ₹3K spend)",
    tops.ctr,
    "CTR",
    (a) => `${a.ctr.toFixed(2)}%`,
    "Berry Cola PM has 4.2% CTR (way above industry 1-2%) but only 1.02x ROAS — the click problem isn't an ad problem, it's a landing-page / offer problem. Audit the funnel for Berry Cola.",
    ROSE
  );

  topSlide(
    "Top 5 by Hook Rate",
    "Best 3-second video opens — % staying past the hook (≥ ₹3K spend)",
    tops.hook,
    "Hook %",
    (a) => `${a.hookRate.toFixed(1)}%`,
    "EISM Flight has the BEST hook (45%) but the WORST ROAS (0.27x). The opener works, the rest doesn't convert. Repurpose the opener or rework the body.",
    AMBER
  );

  return pres;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log("Loading ads from Neon...");
  const ads = await loadAds();
  const tops = pickTops(ads);
  console.log(`Loaded ${ads.length} ads with daily activity.`);

  // Collect unique metaAdIds across all top lists
  const allTopAds = [
    ...tops.spend, ...tops.roas, ...tops.purchases, ...tops.ctr, ...tops.hook,
  ];
  const uniqueMetaIds = [...new Set(allTopAds.map((a) => a.metaAdId).filter(Boolean))];
  console.log(`Need ${uniqueMetaIds.length} unique thumbnails. Fetching fresh URLs from Meta...`);
  const thumbMap = await fetchFreshThumbUrls(uniqueMetaIds);
  const gotUrls = [...thumbMap.values()].filter(Boolean).length;
  console.log(`Got ${gotUrls}/${uniqueMetaIds.length} fresh URLs. Downloading JPEGs...`);
  const thumbPaths = await downloadThumbs(thumbMap);
  console.log(`Downloaded ${thumbPaths.size} thumbnails.`);

  const pres = buildDeck(tops, thumbPaths);
  const out = "waterful_meta_ads_may1_to_jun11_with_thumbs.pptx";
  await pres.writeFile({ fileName: out });
  console.log("Wrote: " + out);
  await prisma.$disconnect();
})();
