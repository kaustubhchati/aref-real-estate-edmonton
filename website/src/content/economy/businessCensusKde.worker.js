// =============================================================================
// businessCensusKde.worker.js — off-main-thread KDE dominance surface.
//
// Keeps the ~22–65 ms compute (measured) off the main thread so live parameter
// tuning never hitches the map (spec §2.2 / the measured viability report). Vite
// bundles this via `new Worker(new URL(...), { type: "module" })`.
//
// In:  { lon:Float32Array, lat:Float32Array, cat:Int16Array, palette:[{L,C,H}], params }
// Out: { rgba:Uint8ClampedArray, width, height, coordinates, coocc, stats }
// =============================================================================

import { computeDominanceSurface } from "./businessCensusKde.js";

self.onmessage = (e) => {
  const { lon, lat, cat, palette, params, token } = e.data;
  const result = computeDominanceSurface(lon, lat, cat, palette, params);
  // echo the token so the page can drop a stale result if params changed mid-compute;
  // transfer the raster buffer (zero-copy) rather than clone it.
  self.postMessage({ ...result, token }, [result.rgba.buffer]);
};
