// =============================================================================
// verify-popup-html.mjs — rendered-HTML diff for the map popups
//
// WHAT IT VERIFIES
//   That the map popups still produce identical HTML. It calls the real popup
//   builder with fixed test data covering every branch (has data, no data,
//   annexation area, missing district, null values) and prints the HTML.
//
//   WHY NOT JUST HOVER THE MAP: in a headless browser the map never resolves
//   which feature is under the cursor, so no popup ever appears. Calling the
//   builder directly is the only way to check popup text at all.
//
// HOW TO RUN
//   1. In one terminal:   cd website && npm run dev -- --port 5199
//   2. In another, pass the property names the CURRENT code expects:
//      cd website && node scripts/verify-popup-html.mjs before.txt \
//        '{"biz":"n_businesses","emp":"n_employees","pbiz":"prior_n_businesses","pemp":"prior_n_employees","year":2025}'
//   3. Make your change, re-run to after.txt, then:  diff before.txt after.txt
//
// WHAT A PASS LOOKS LIKE
//   `diff` prints NOTHING.
//
// WHAT A FAIL LOOKS LIKE
//   `diff` prints changed HTML. Read it as a reader would — a changed label or
//   a changed number is a real change; nothing else should move.
//
// REQUIRES
//   playwright, which is NOT installed by `npm install`. See
//   scripts/README-verification.md.
// =============================================================================

// A1 supplement — popup RENDERED OUTPUT, captured by calling the real builder.
//
// WHY NOT A BROWSER HOVER: headless software WebGL never resolves
// queryRenderedFeatures for this layer, so no hover popup ever appears (a full
// 10x11 grid sweep of the canvas found none). Rather than declare 6 of the 8
// year-bearing labels untestable, the real exported builder is called directly
// through the dev server's module graph, with fixtures covering every branch.
//
// The fixture is passed with whatever key names the CURRENT code expects; the
// assertion is that the HTML STRING is identical pre and post. Same data, same
// rendered output, different key names underneath — which is exactly the claim.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2];
const KEYS = JSON.parse(process.argv[3]);   // {biz, emp, pbiz, pemp}

const b = await chromium.launch({ args:["--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.goto("http://localhost:5199/economy/business-counts",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(3000);
const html = await p.evaluate(async (K) => {
  const m = await import("/src/content/economy/businessCensusStyle.js");
  const base = (extra) => Object.assign({
    display_name: "TEST NEIGHBOURHOOD", planning_district: "Test District",
    civic_ward: "Ward T", census_state: "data", is_annexation_area: 0,
    [K.biz]: 1234, [K.emp]: 5678, [K.pbiz]: 1000, [K.pemp]: 5000,
    yoy_businesses_change: 234, yoy_employees_change: 678,
    yoy_businesses_pct: 23.4, yoy_employees_pct: 13.6,
  }, extra);
  const cases = [
    ["data+district",        base({})],
    ["data+annex",           base({ is_annexation_area: 1 })],
    ["data+no district",     base({ planning_district: null })],
    ["no_data",              base({ census_state: "no_data" })],
    ["nulls",                base({ [K.biz]: null, [K.emp]: null })],
  ];
  const out = [];
  for (const [label, props] of cases) {
    for (const detail of [false, true]) {
      out.push(`### ${label} detail=${detail}`);
      out.push(m.buildBusinessCensusPopupHtml(props, detail, K.year));
    }
  }
  // Metric LABELS only. Keys are data and are renamed by design; labels are what
  // a reader sees, so they are the thing that must not move. Works against both
  // the old module (exported METRICS) and the new one (metricsFor(year)).
  const metrics = m.metricsFor ? m.metricsFor(K.year) : m.METRICS;
  out.push("### METRIC LABELS");
  out.push(JSON.stringify(metrics.map(x => x.label), null, 1));
  out.push("### LEGEND_STATES");
  out.push(JSON.stringify(m.LEGEND_STATES, null, 1));
  return out.join("\n");
}, KEYS);
writeFileSync(OUT, html + "\n");
console.log("wrote", OUT);
await b.close();
