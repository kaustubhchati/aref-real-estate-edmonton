// =============================================================================
// verify-map-viewport.mjs — map camera + render height, across window sizes
//
// WHAT IT VERIFIES
//   Loads every map at three window sizes and checks (a) the visible map area
//   contains the whole city, and (b) the map element is taller than 200px (a
//   collapsed map has bitten this project before).
//
// HOW TO RUN
//   1. In one terminal:   cd website && npm run dev -- --port 5199
//   2. In another:        cd website && node scripts/verify-map-viewport.mjs
//
// WHAT A PASS LOOKS LIKE
//   "OVERALL: PASS", exit code 0.
//
// WHAT A FAIL LOOKS LIKE
//   "OVERALL: FAIL", exit code 1.
//
// IMPORTANT — THIS SCRIPT CURRENTLY FAILS ON PURPOSE
//   It was written for a proposed "fit the whole city into any window" camera
//   that was TRIED AND NOT ADOPTED. The site ships a fixed centre+zoom home
//   instead, which deliberately does NOT fit the whole city into a small
//   window. So the containment check fails at 1280x800 and 640x800 and passes
//   only at 2560x1600. That is the shipped design, not a bug.
//
//   The render-height half of this script (the second set of lines) is still
//   meaningful and still passes.
//
// REQUIRES
//   playwright, which is NOT installed by `npm install`. See
//   scripts/README-verification.md.
// =============================================================================

import { chromium } from "playwright";
const ENV = { w:-113.713802, s:53.337361, e:-113.271524, n:53.715919 };
const contains = (b) => b && b.w<=ENV.w+1e-4 && b.e>=ENV.e-1e-4 && b.s<=ENV.s+1e-4 && b.n>=ENV.n-1e-4;
const GLOBAL = [
  ["PA","/properties/property-assessment","__paMap"],
  ["DU","/activity/dwelling-units","__duMap"],
  ["BC-census","/economy/business-census","__bcMap"],
  ["zoning","/properties/zoning","__zoningMap"],
  ["amen-point","/amenities/police-stations","__amenityMap"],
  ["amen-dens","/amenities/public-transportation","__amenityMap"],
  ["amen-net","/amenities/public-transportation?view=lrt-network","__amenityMap"],
];
const RENDER = [["BC-counts","/economy/business-counts"],["BP","/activity/construction-improvement"]];
const SIZES = [[1280,800],[640,800],[2560,1600]];
const b = await chromium.launch({ args:["--enable-unsafe-swiftshader","--use-gl=swiftshader","--ignore-gpu-blocklist"] });
let pass = true;
for (const [key,url,g] of GLOBAL){
  process.stdout.write(`${key}: `);
  for (const [w,h] of SIZES){
    const ctx = await b.newContext({ viewport:{width:w,height:h} });
    const p = await ctx.newPage();
    const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
    await p.goto("http://localhost:5199"+url,{waitUntil:"domcontentloaded"});
    await p.waitForFunction((gg)=>window[gg]&&window[gg].isStyleLoaded(),g,{timeout:20000}).catch(()=>{});
    await p.waitForTimeout(1400);
    const bnd = await p.evaluate((gg)=>{const m=window[gg];if(!m)return null;const b=m.getBounds();return{w:b.getWest(),e:b.getEast(),s:b.getSouth(),n:b.getNorth(),z:+m.getZoom().toFixed(1)};},g);
    const ok = contains(bnd) && !errs.length;
    process.stdout.write(`${w}x${h}=${ok?"OK":"FAIL"}(z${bnd?.z}) `);
    if(!ok){pass=false; if(errs.length)process.stdout.write(`[err:${errs[0].slice(0,40)}]`);}
    await ctx.close();
  }
  process.stdout.write("\n");
}
for (const [key,url] of RENDER){
  const ctx = await b.newContext({ viewport:{width:1280,height:800} });
  const p = await ctx.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5199"+url,{waitUntil:"domcontentloaded"});
  await p.waitForSelector(".maplibregl-canvas",{timeout:20000}).catch(()=>{});
  await p.waitForTimeout(1500);
  const r = await p.evaluate(()=>{const c=document.querySelector(".maplibregl-map");return{canvas:!!document.querySelector(".maplibregl-canvas"),h:c?Math.round(c.getBoundingClientRect().height):0};});
  const ok = r.canvas && r.h>200 && !errs.length;
  console.log(`${key}: render=${ok?"OK":"FAIL"} (h=${r.h}${errs.length?" err:"+errs[0].slice(0,40):""})`);
  if(!ok)pass=false;
  await ctx.close();
}
console.log(`\nOVERALL: ${pass?"PASS":"FAIL"}`);
await b.close(); process.exit(pass?0:1);
