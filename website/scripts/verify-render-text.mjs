// =============================================================================
// verify-render-text.mjs — rendered-TEXT diff for the business census section
//
// WHAT IT VERIFIES
//   That a change did not alter what a reader SEES. It loads both economy routes
//   and captures the page text, every labelled element, and any popup text, then
//   you diff two captures (before your change, after it). Pixels are not checked:
//   the maps are WebGL and never render identically twice. Text does.
//
// HOW TO RUN
//   1. In one terminal:   cd website && npm run dev -- --port 5199
//   2. In another:        cd website && node scripts/verify-render-text.mjs before.txt
//   3. Make your change, then:  node scripts/verify-render-text.mjs after.txt
//   4. Compare:           diff before.txt after.txt
//
// WHAT A PASS LOOKS LIKE
//   `diff` prints NOTHING. The rendered text is unchanged.
//
// WHAT A FAIL LOOKS LIKE
//   `diff` prints lines. Every line is something a reader would notice. Also
//   check the "console errors" and "failed requests" counts inside the file —
//   both should be 0.
//
// REQUIRES
//   playwright, which is NOT installed by `npm install` (it is not in
//   package.json). See scripts/README-verification.md before running.
// =============================================================================

// A1 instrument — rendered-output capture for the business census section.
//
// Playwright TEXT capture, following this project's existing verification
// practice (website/_va.mjs on disk is the precedent). Pixels are not the test:
// the map is WebGL and non-deterministic. Rendered text is deterministic, and it
// is where every year-bearing label lives.
//
// Only RENDERED output is captured. Raw feature properties are deliberately NOT
// captured: the whole point of the change is that property KEYS get renamed, so
// dumping them would fail by construction while telling us nothing about what a
// reader sees.
//
// Popups are captured by hovering fixed CANVAS COORDINATES. Both maps land on the
// same committed HOME_VIEW camera at a fixed viewport, so a given pixel resolves
// to the same neighbourhood on every run. 6 of the 8 year-bearing labels live in
// the popup builders (businessCensusStyle.js:411-446) and appear in no page text.
//
// Both routes are captured. Only Business Counts changes; the LCLQ route shares
// the section name and data directory, so capturing it proves it was undisturbed.

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:5199";
const OUT = process.argv[2];
const norm = (s) => (s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

// A spread of points over the rendered city, in canvas coordinates.
const PROBES = [
  [700, 430], [640, 400], [760, 460], [700, 500], [660, 470],
  [740, 410], [700, 380], [620, 450], [780, 430], [700, 550],
];

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const out = [];

async function capture(label, path) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  const failed = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(norm(m.text())); });
  page.on("requestfailed", (r) => failed.push(`${r.url()} :: ${r.failure()?.errorText}`));

  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  // networkidle is unusable on the census route: a 12 MB points file plus a KDE
  // worker keep the network busy. Settle on a fixed dwell instead.
  await page.waitForTimeout(20000);

  out.push(`===== ROUTE ${label} ${path} =====`);
  out.push(`--- page text ---`);
  out.push(norm(await page.evaluate(() => document.body.innerText)));

  const chips = await page.evaluate(() =>
    Array.from(document.querySelectorAll(
      ".legend-row, .pa-metric, .metric-btn, button, label, option, .pop-k, .pop-v"
    )).map((e) => e.textContent)
  );
  out.push(`--- labelled elements (${chips.length}) ---`);
  out.push(chips.map(norm).filter(Boolean).join("\n"));

  // Hover fixed canvas points; capture whatever popup text appears.
  const seen = new Set();
  for (const [x, y] of PROBES) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(500);
    const txt = await page.evaluate(() => {
      const p = document.querySelector(".maplibregl-popup-content");
      return p ? p.innerText : "";
    });
    const n = norm(txt);
    if (n) seen.add(n);
  }
  out.push(`--- popups from ${PROBES.length} fixed hover points (${seen.size} distinct) ---`);
  out.push([...seen].sort().join("\n~~~\n"));

  out.push(`--- console errors (${errors.length}) ---`);
  out.push(errors.join("\n"));
  out.push(`--- failed requests (${failed.length}) ---`);
  out.push(failed.join("\n"));
  out.push("");
  await page.close();
}

await capture("BC-COUNTS", "/economy/business-counts");
await capture("BC-CENSUS", "/economy/business-census");

await browser.close();
writeFileSync(OUT, out.join("\n") + "\n");
console.log(`wrote ${OUT}`);
