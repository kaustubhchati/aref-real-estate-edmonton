// =============================================================================
// verify-attribution.mjs — the attribution panel, on every map
//
// WHAT IT VERIFIES
//   That every map still credits its data sources. Opens the bottom-right
//   "Data & attribution" button on each map route and checks: the old native
//   MapLibre bar is gone, all five required credit strings are present, the
//   links are live, and the panel closes three ways (second click, Escape,
//   click outside). This is a LICENCE obligation, not a style preference.
//
// HOW TO RUN
//   1. In one terminal:   cd website && npm run dev -- --port 5199
//   2. In another:        cd website && node scripts/verify-attribution.mjs
//
// WHAT A PASS LOOKS LIKE
//   Every line starts with a tick, and the last line reads
//   "===== OVERALL: PASS =====".
//
// WHAT A FAIL LOOKS LIKE
//   Lines starting with a cross, and "OVERALL: FAIL".
//
// KNOWN PROBLEM — READ THIS BEFORE TRUSTING A FAILURE
//   This script is FLAKY. Run twice on unchanged code it can give different
//   answers, and it sometimes crashes mid-run instead of reporting. It waits a
//   fixed time for the attribution button, and on the Business Counts route the
//   button now appears later than it used to. A single failure here is NOT
//   evidence of a regression — re-run it, and if it disagrees with itself,
//   the script is at fault, not the site.
//
// REQUIRES
//   playwright, which is NOT installed by `npm install`. See
//   scripts/README-verification.md.
// =============================================================================

import { chromium } from "playwright";

const B = "http://localhost:5199";
const ROUTES = [
  { key: "PA",         url: `${B}/properties/property-assessment` },
  { key: "DU",         url: `${B}/activity/dwelling-units` },
  { key: "BC-census",  url: `${B}/economy/business-census`, extra: ["Edmonton Business Census"] },
  { key: "BC-counts",  url: `${B}/economy/business-counts` },
  { key: "BP-point",   url: `${B}/activity/construction-improvement` },
  { key: "amen-point", url: `${B}/amenities/police-stations` },
  { key: "amen-dens",  url: `${B}/amenities/public-transportation` },
  { key: "amen-net",   url: `${B}/amenities/public-transportation?view=lrt-network` },
  { key: "zoning",     url: `${B}/properties/zoning` },
];
const STRINGS = ["City of Edmonton Open Data", "Open Government Licence", "CARTO", "OpenStreetMap", "do not represent an official"];
const WIDTHS = [1280, 1440, 1920];

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
let allPass = true;
const fail = (k, msg) => { allPass = false; console.log(`  ✗ [${k}] ${msg}`); };

async function openPanel(page) {
  const btn = page.locator(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group button").first();
  await btn.click();
  await page.waitForTimeout(350);
  return btn;
}

for (const r of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/key. prop|feature id is required|KpiCard/.test(t)) errors.push(t); } });
  page.on("pageerror", (e) => errors.push(String(e)));
  console.log(`\n===== ${r.key} =====`);
  await page.goto(r.url, { waitUntil: "domcontentloaded" });
  try { await page.waitForSelector(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group button", { timeout: 20000 }); }
  catch { fail(r.key, "database control never appeared"); await ctx.close(); continue; }
  // Dismiss the auto-opened About&tips intro card (first-visit; fresh context) so it does
  // not intercept clicks on the bottom-right database control. Pre-existing, out of scope.
  await page.keyboard.press("Escape"); await page.waitForTimeout(250);

  // 1. native attribution bar GONE
  const native = await page.evaluate(() => !!document.querySelector(".maplibregl-ctrl-attrib"));
  if (native) fail(r.key, "native .maplibregl-ctrl-attrib STILL PRESENT"); else console.log("  ✓ native bar removed");

  // 2. open panel + string audit + links
  await openPanel(page);
  const audit = await page.evaluate((strings) => {
    const p = document.querySelector(".pa-attrib-pop");
    if (!p) return { open: false };
    const txt = p.textContent;
    const missing = strings.filter((s) => !txt.includes(s));
    const links = [...p.querySelectorAll("a")].map((a) => ({ href: a.getAttribute("href"), text: a.textContent }));
    const deadLinks = links.filter((l) => !l.href || l.href === "#");
    return { open: true, missing, nLinks: links.length, deadLinks, txt };
  }, [...STRINGS, ...(r.extra || [])]);
  if (!audit.open) { fail(r.key, "panel did not open on click"); }
  else {
    if (audit.missing.length) fail(r.key, `MISSING strings: ${audit.missing.join(" | ")}`); else console.log(`  ✓ all strings present (${STRINGS.length + (r.extra?.length || 0)})`);
    if (audit.deadLinks.length) fail(r.key, `dead links: ${audit.deadLinks.length}`); else console.log(`  ✓ ${audit.nLinks} links, all live`);
  }

  // 3. close routes: 2nd click, Esc, click-outside
  const btn = page.locator(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group button").first();
  await btn.click(); await page.waitForTimeout(250);
  let gone = await page.evaluate(() => !document.querySelector(".pa-attrib-pop"));
  if (!gone) fail(r.key, "2nd-click did not close"); else console.log("  ✓ 2nd-click closes");
  await openPanel(page);
  await page.keyboard.press("Escape"); await page.waitForTimeout(250);
  gone = await page.evaluate(() => !document.querySelector(".pa-attrib-pop"));
  if (!gone) fail(r.key, "Esc did not close"); else console.log("  ✓ Esc closes");
  await openPanel(page);
  await page.mouse.click(640, 300); await page.waitForTimeout(250);
  gone = await page.evaluate(() => !document.querySelector(".pa-attrib-pop"));
  if (!gone) fail(r.key, "click-outside did not close"); else console.log("  ✓ click-outside closes");

  // 4. geometry at all three widths (corner order, scale unoccluded, panel in-viewport, no layout shift)
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 860 });
    await page.waitForTimeout(200);
    const geo = await page.evaluate(() => {
      const rect = (el) => el ? el.getBoundingClientRect() : null;
      const btn = document.querySelector(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group button");
      const scale = document.querySelector(".maplibregl-ctrl-scale");
      return { btn: rect(btn), scale: rect(scale) };
    });
    const scaleBefore = geo.scale;
    if (!geo.btn || !geo.scale) { fail(r.key, `@${w}: missing btn/scale`); continue; }
    // corner order: ⓘ button ABOVE scale bar
    if (geo.btn.top >= geo.scale.top) fail(r.key, `@${w}: ⓘ NOT above scale bar (btn.top ${Math.round(geo.btn.top)} >= scale.top ${Math.round(geo.scale.top)})`);
    // open panel, check in-viewport + doesn't cover scale + no scale shift
    await openPanel(page);
    const pg = await page.evaluate((vw) => {
      const p = document.querySelector(".pa-attrib-pop");
      const scale = document.querySelector(".maplibregl-ctrl-scale");
      if (!p) return { noPanel: true };
      const pr = p.getBoundingClientRect(), sr = scale.getBoundingClientRect();
      const inView = pr.left >= 0 && pr.top >= 0 && pr.right <= vw && pr.bottom <= 860;
      const coversScale = !(pr.bottom <= sr.top || pr.top >= sr.bottom || pr.right <= sr.left || pr.left >= sr.right);
      return { inView, coversScale, scaleTop: sr.top };
    }, w);
    if (pg.noPanel) { fail(r.key, `@${w}: panel missing in geometry pass`); }
    else {
      if (!pg.inView) fail(r.key, `@${w}: panel OUT of viewport`);
      if (pg.coversScale) fail(r.key, `@${w}: panel COVERS scale bar`);
      if (Math.abs(pg.scaleTop - scaleBefore.top) > 1) fail(r.key, `@${w}: scale bar SHIFTED on panel open (${Math.round(scaleBefore.top)}→${Math.round(pg.scaleTop)})`);
    }
    // close before next width
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  }
  console.log(`  geometry @ 1280/1440/1920 checked`);
  if (errors.length) fail(r.key, `console errors: ${errors.slice(0,2).join(" | ")}`); else console.log("  ✓ no console errors");
  await ctx.close();
}
console.log(`\n===== OVERALL: ${allPass ? "PASS" : "FAIL"} =====`);
await browser.close();
process.exit(allPass ? 0 : 1);
