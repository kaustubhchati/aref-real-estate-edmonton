// =============================================================================
// verify-layer-list.mjs — dump the map's layer stack (a diagnostic, not a test)
//
// WHAT IT DOES
//   Prints every MapLibre layer on the Businesses and Industry Specializations
//   map, in draw order, with its type and source. Useful when a layer is
//   painting over another and you need to see the real order.
//
//   This is a DIAGNOSTIC. It has no pass or fail; it prints a list.
//
// HOW TO RUN
//   1. In one terminal:   cd website && npm run dev        (port 5173, the default)
//   2. In another:        cd website && node scripts/verify-layer-list.mjs
//
// WHAT A PASS LOOKS LIKE
//   A numbered list of layers.
//
// IMPORTANT — THIS SCRIPT CURRENTLY DOES NOT RUN
//   It waits for an element with the class "legend-row", which that page no
//   longer has; it times out after 90 seconds and prints an error instead of a
//   layer list. It is kept because the layer dump itself is still the right
//   idea — the selector it waits on needs updating first.
//
//   NOTE it uses port 5173, not 5199 like the others.
//
// REQUIRES
//   playwright, which is NOT installed by `npm install`. See
//   scripts/README-verification.md.
// =============================================================================

import { chromium } from "playwright";
const b=await chromium.launch({args:["--enable-unsafe-swiftshader"]});
const p=await b.newPage({viewport:{width:1400,height:900}});
await p.goto("http://localhost:5173/economy/business-census",{waitUntil:"domcontentloaded"});
await p.waitForSelector(".legend-row",{timeout:90000});
const layers=await p.evaluate(async()=>{const s=ms=>new Promise(r=>setTimeout(r,ms));let n=0;while(!window.__bcMap&&n<300){await s(50);n++;}const m=window.__bcMap;await new Promise(r=>{m.once("idle",r);setTimeout(r,15000);});
  return m.getStyle().layers.map(l=>({id:l.id,type:l.type,src:l['source-layer']||l.source||''}));});
// group by type
const byType={};
for(const l of layers){(byType[l.type]=byType[l.type]||[]).push(l.id);}
console.log("=== ALL layers in order (id : type : source-layer) ===");
layers.forEach((l,i)=>console.log(`${String(i).padStart(3)}  ${l.type.padEnd(6)} ${l.id}   [${l.src}]`));
console.log("\n=== by type ===");
for(const t in byType) console.log(`${t}: ${byType[t].length} → ${byType[t].join(", ")}`);
await b.close();
