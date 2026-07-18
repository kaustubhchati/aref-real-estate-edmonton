// =============================================================================
// crossFadeSource.js
//
// Swap a MapView GeoJSON source to a new URL with a genuine year-to-year
// CROSS-FADE — the outgoing points fade out while the incoming points fade in,
// and the two OVERLAP so the map is never empty of points mid-swap.
//
// Why this exists (the regression it fixes):
//   The clipping fix (MapView's recreate-source swap) removes the layer and
//   re-adds it. A freshly-added layer has no prior paint state to transition
//   FROM, so the year-swap cross-fade that setData used to get for free died.
//   The clipping fix STAYS (no setData on the year path). This wraps a real
//   transition around it.
//
// The shape (why a ghost):
//   A source id (e.g. "permits") can exist only once, and the section wires its
//   filter + popups to a FIXED layer id ("permits-circles"). So the canonical
//   source/layer must always end up holding the CURRENT year. To show the OLD
//   year during the swap we spin up a throwaway GHOST source/layer, fade it out,
//   and discard it. Canonical = new; ghost = old. The section never sees the ghost.
//
// The trap (why we scale, not set):
//   circle-opacity is a ZOOM interpolation (0.55→0.88 across z9→z18). A fade that
//   set opacity to a constant would flatten that ramp mid-transition. So the fade
//   MULTIPLIES the layer's own opacity expression by a 0→1 factor
//   (`["*", f, <the interpolation>]`) — the ramp holds at every f, every zoom.
//
// Reduced motion / motion-off:
//   duration 0 → straight recreate, no ghost, no fade (the pre-fade behaviour).
//
// Legibility (CLAUDE.md §6): one exported entry point (crossFadeSource); small
// named helpers; the interrupt state is a plain object the caller owns by ref.
// =============================================================================

import { DUR_SLOW, MOTION_PASS, reduceMotion } from "./motion.js";

// The opacity paint property (or properties) that carry a layer's visibility, by
// layer type. The fade scales these. Only the types MapView actually swaps need
// listing; unknown types get an empty list (→ straight recreate, no fade).
const OPACITY_PROPS = {
  circle: ["circle-opacity"],
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
  heatmap: ["heatmap-opacity"],
  raster: ["raster-opacity"],
};

// The PRISTINE opacity expression for one layer+prop, read from the mount-time
// `layers` spec (never from the live style, which may already carry a `["*", …]`
// fade wrapper — reading pristine avoids accumulating nested wrappers over swaps).
// A layer with no explicit opacity defaults to 1 (a constant, which scales fine).
function baseOpacity(baseLayers, layerId, prop) {
  const spec = baseLayers.find((l) => l.id === layerId);
  const v = spec?.paint?.[prop];
  return v == null ? 1 : v;
}

// Scale an opacity value/expression by a constant factor WHILE keeping it a LEGAL
// MapLibre expression, ramp intact. The trap: a zoom `interpolate` CANNOT be wrapped in
// `["*", f, …]` — MapLibre requires a "zoom" expression to be top-level. So instead of
// wrapping, we fold the factor into the interpolate's OUTPUT stops (every stop × factor):
// the ramp shape is preserved (all stops scale together) and the expression stays a valid
// top-level interpolate. Constants multiply directly; step outputs scale the same way; a
// non-zoom expression can still take the plain `["*", …]` (the fallback).
// factor 1 → the expression itself unchanged (no wrapper left at rest).
function scaleOpacity(expr, factor) {
  if (factor === 1) return expr;
  if (typeof expr === "number") return expr * factor;
  if (Array.isArray(expr) && expr[0] === "interpolate") {
    const out = expr.slice(0, 3);                                 // ["interpolate", type, input]
    for (let i = 3; i < expr.length; i += 2) out.push(expr[i], scaleOpacity(expr[i + 1], factor));
    return out;
  }
  if (Array.isArray(expr) && expr[0] === "step") {
    const out = ["step", expr[1], scaleOpacity(expr[2], factor)]; // ["step", input, out0, in1, out1, …]
    for (let i = 3; i < expr.length; i += 2) out.push(expr[i], scaleOpacity(expr[i + 1], factor));
    return out;
  }
  return ["*", factor, expr];                                     // non-zoom fallback (legal without "zoom")
}

// The layers currently riding `sourceId`, in style order, each tagged with the id
// of the first FOLLOWING layer NOT on this source — a stable anchor (never removed
// here) that reproduces the layer's stack position on re-add. (Same anchor logic
// the recreate-source fix established.)
function ownedLayers(map, sourceId) {
  const layers = map.getStyle()?.layers ?? [];
  const owned = [];
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].source !== sourceId) continue;
    let anchor;
    for (let j = i + 1; j < layers.length; j++) {
      if (layers[j].source !== sourceId) { anchor = layers[j].id; break; }
    }
    owned.push({ spec: layers[i], anchor });
  }
  return owned;
}

const anchorArg = (map, anchor) => (anchor && map.getLayer(anchor) ? anchor : undefined);

function addGeojsonSource(map, id, url, promoteId) {
  const spec = { type: "geojson", data: url };
  if (promoteId) spec.promoteId = promoteId;
  map.addSource(id, spec);
}

// Recreate the canonical source in place: detach its layers, drop + re-add the
// source with the new data, re-attach the layers at their anchors. `fade`, when
// passed ({ baseLayers, duration } — the fade path), re-adds each layer at opacity 0
// with a `duration`-ms opacity transition armed, so the subsequent fadeTo(…, 1)
// tweens it up. Without it (reduced motion) the layers re-add at their normal
// opacity — the plain swap the clipping fix shipped.
function recreateCanonical(map, sourceId, url, promoteId, owned, fade) {
  for (const { spec } of owned) if (map.getLayer(spec.id)) map.removeLayer(spec.id);
  map.removeSource(sourceId);
  addGeojsonSource(map, sourceId, url, promoteId);
  for (const { spec, anchor } of owned) {
    let toAdd = spec;
    if (fade) {
      // Start invisible; fadeTo (step 3) arms the transition and tweens it up. We do
      // NOT arm the transition here — fadeTo is the single owner of transition timing.
      const paint = { ...(spec.paint || {}) };
      for (const prop of OPACITY_PROPS[spec.type] || []) {
        paint[prop] = scaleOpacity(baseOpacity(fade.baseLayers, spec.id, prop), 0);
      }
      toAdd = { ...spec, paint };
    }
    map.addLayer(toAdd, anchorArg(map, anchor));
  }
}

// The design system's motion curve (index.css --ease = cubic-bezier(.4,0,.2,1)),
// evaluated in JS so the fade eases exactly like the CSS crossfades. Newton-solves
// x(t)=p for t, then returns y(t). (A tiny standard routine — the same math the
// browser runs for a CSS cubic-bezier.)
function makeCubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const xAt = (t) => ((ax * t + bx) * t + cx) * t;
  const yAt = (t) => ((ay * t + by) * t + cy) * t;
  const dxAt = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (p) => {
    let t = p;
    for (let i = 0; i < 5; i++) { const e = xAt(t) - p; if (Math.abs(e) < 1e-4) break; t -= e / (dxAt(t) || 1e-6); }
    return yAt(Math.max(0, Math.min(1, t)));
  };
}
const EASE = makeCubicBezier(0.4, 0, 0.2, 1);

// Set one layer's opacity prop(s) to `factor` × its PRISTINE base expression — the
// ramp-preserving multiply. factor 1 → the bare expression (no wrapper left at rest).
// baseId is the layer's own id (canonical) or the mirrored real id (ghost).
function setLayerOpacity(map, layerId, type, baseLayers, baseId, factor) {
  if (!map.getLayer(layerId)) return;
  for (const prop of OPACITY_PROPS[type] || []) {
    map.setPaintProperty(layerId, prop, scaleOpacity(baseOpacity(baseLayers, baseId, prop), factor));
  }
}

// Cross-fade a set of layers by rAF: each item's opacity factor eases from `from`→`to`
// over `duration`, scaling its base expression EVERY FRAME so the zoom ramp holds at
// every point of the fade (never a flat constant). We drive it ourselves (not MapLibre's
// paint transition) so the intermediate is observable/verifiable and matches --ease. The
// per-prop transition is pinned to 0 first, so each frame's set lands instantly (no
// default 300 ms tween smearing our animation). rafId lives in `state` for abort.
function animateFade(map, items, duration, stateRef, token, onDone) {
  const state = stateRef.current;                       // this swap's OWN state object (for raf)
  for (const it of items) {
    if (!map.getLayer(it.layerId)) continue;
    for (const prop of OPACITY_PROPS[it.type] || []) map.setPaintProperty(it.layerId, `${prop}-transition`, { duration: 0, delay: 0 });
    setLayerOpacity(map, it.layerId, it.type, it.baseLayers, it.baseId, it.from);
  }
  const start = performance.now();
  const step = (now) => {
    if (stateRef.current.token !== token) return;      // superseded (LIVE check) — newer swap owns cleanup
    const e = EASE(Math.min(1, (now - start) / duration));
    for (const it of items) setLayerOpacity(map, it.layerId, it.type, it.baseLayers, it.baseId, it.from + (it.to - it.from) * e);
    if ((now - start) / duration < 1) { state.raf = requestAnimationFrame(step); }
    else { state.raf = null; onDone(); }
  };
  state.raf = requestAnimationFrame(step);
}

// Resolve once the source's tiles have painted (so we never fade in an empty layer
// or fade out into a gap). Resolves early if the swap was superseded, and has a
// hard fallback so a swap can never hang. Registers its listener for abort cleanup.
function waitSourceLoaded(map, sourceId, state, token) {
  return new Promise((resolve) => {
    if (map.isSourceLoaded(sourceId)) { resolve(); return; }
    let done = false, timer;
    const finish = () => { if (done) return; done = true; map.off("sourcedata", onData); clearTimeout(timer); resolve(); };
    const onData = (e) => {
      if (state.token !== token) { finish(); return; }             // superseded → bail
      if (e.sourceId === sourceId && map.isSourceLoaded(sourceId)) finish();
    };
    map.on("sourcedata", onData);
    timer = setTimeout(finish, 5000);                              // never hang the UI
    // Registered so abort() stops BOTH the listener and the fallback (no post-unmount fire).
    state.listeners.push(() => { map.off("sourcedata", onData); clearTimeout(timer); });
  });
}

// Tear down whatever the ghost left behind: its layers, then its source.
function removeGhost(map, state) {
  for (const id of state.ghostLayers || []) if (map.getLayer(id)) map.removeLayer(id);
  if (state.ghostSrc && map.getSource(state.ghostSrc)) map.removeSource(state.ghostSrc);
  state.ghostLayers = [];
  state.ghostSrc = null;
}

// Abort the in-flight swap (a newer one is starting, or the map is unmounting): cancel
// the rAF + timers/listeners, drop the ghost, and snap the canonical layers back to full
// opacity so a swap interrupted mid-fade doesn't strand them dim. No orphans, ever.
export function abortCrossFade(map, stateRef, baseLayers) {
  const state = stateRef.current;
  if (!state) return;
  if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  for (const off of state.listeners || []) off();
  state.listeners = [];
  if (!map) return;
  try {
    removeGhost(map, state);
    if (baseLayers) {
      for (const l of baseLayers) {
        if (!map.getLayer(l.id)) continue;
        for (const prop of OPACITY_PROPS[l.type] || []) {
          map.setPaintProperty(l.id, `${prop}-transition`, { duration: 0, delay: 0 });
          map.setPaintProperty(l.id, prop, baseOpacity(baseLayers, l.id, prop));
        }
      }
    }
  } catch { /* map mid-teardown — nothing left to clean */ }
}

// The one entry point. Swap `sourceId` from `oldUrl` to `newUrl`, cross-fading if
// motion is on. `stateRef` is a caller-owned ref ({current:{…}}) holding interrupt
// state across calls. Returns a promise that resolves when the swap is committed
// (the fade may still be animating — its cleanup is self-scheduled).
export async function crossFadeSource(map, { sourceId, oldUrl, newUrl, promoteId, baseLayers, stateRef }) {
  // A newer swap supersedes any in-flight one. Snap the previous clean first.
  abortCrossFade(map, stateRef, baseLayers);

  const token = (stateRef.current?.token || 0) + 1;
  stateRef.current = { token, listeners: [], ghostLayers: [], ghostSrc: null, timer: null, raf: null };
  const alive = () => stateRef.current.token === token && map.getSource(sourceId);

  const owned = ownedLayers(map, sourceId);
  const duration = MOTION_PASS && !reduceMotion() ? DUR_SLOW : 0;

  // Reduced motion / motion-off / nothing to fade / first load → the plain recreate
  // (the clipping fix's behaviour): straight swap, no ghost, no overlap.
  if (duration <= 0 || owned.length === 0 || oldUrl == null) {
    recreateCanonical(map, sourceId, newUrl, promoteId, owned);
    return;
  }
  const fade = { baseLayers, duration };

  // 1) GHOST the outgoing year on a throwaway source, at full opacity, at the same
  //    anchor. The old canonical is still visible beneath it → no gap while it loads.
  const ghostSrc = `${sourceId}__xfade`;
  addGeojsonSource(map, ghostSrc, oldUrl, promoteId);
  stateRef.current.ghostSrc = ghostSrc;
  const ghosts = [];
  for (const { spec, anchor } of owned) {
    const paint = { ...(spec.paint || {}) };
    for (const prop of OPACITY_PROPS[spec.type] || []) paint[prop] = baseOpacity(baseLayers, spec.id, prop);
    const gid = `${spec.id}__xfade`;
    map.addLayer({ ...spec, id: gid, source: ghostSrc, paint }, anchorArg(map, anchor));
    ghosts.push({ id: gid, type: spec.type, originId: spec.id });
    stateRef.current.ghostLayers.push(gid);
  }

  // 2) Once the ghost has painted, recreate the canonical with the NEW year at
  //    opacity 0 (the ghost keeps the old year on screen → still no gap).
  await waitSourceLoaded(map, ghostSrc, stateRef.current, token);
  if (!alive()) return;   // superseded — the newer swap's abort already removed our ghost; do NOT
                          // touch stateRef here (it now belongs to that newer swap).
  recreateCanonical(map, sourceId, newUrl, promoteId, owned, fade);

  // 3) Once the NEW year has painted (ghost still covering), run the OVERLAP: canonical
  //    0→full while ghost full→0, rAF-driven over `duration`, ramp preserved every frame.
  //    On completion the ghost is dropped and the canonical is left at its bare base
  //    opacity expression (no wrapper, no armed transition) — clean for the next swap.
  await waitSourceLoaded(map, sourceId, stateRef.current, token);
  if (!alive()) return;   // superseded — newer swap owns cleanup (see note above)
  const items = [
    ...owned.map(({ spec }) => ({ layerId: spec.id, type: spec.type, baseLayers, baseId: spec.id, from: 0, to: 1 })),
    ...ghosts.map((g) => ({ layerId: g.id, type: g.type, baseLayers, baseId: g.originId, from: 1, to: 0 })),
  ];
  animateFade(map, items, duration, stateRef, token, () => removeGhost(map, stateRef.current));
}
