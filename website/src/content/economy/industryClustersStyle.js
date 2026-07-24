// =============================================================================
// industryClustersStyle.js
//
// View 2 (Industry Clusters) STYLE seam — the section's own point layers + colours
// for the LCLQ significant-cluster map (spec Part 0: each view its own palette).
//
//   • Each SELECTED trade gets a distinct GTA-BRIGHT hue (§1 fix — two selections must
//     never read alike). SIGNIFICANT members render that hue LARGE; non-significant
//     same-trade members render a lighter version, SMALL + volume-scaled (§2 faint fix).
//     REST state: nothing lit until a trade is chosen (spec §2.1). Single-select = the
//     first palette hue.
//   • "Which trade" is carried by the selection + the ranked list swatch (same palette).
//   • The source carries ONLY tested businesses — an untested business (<30-citywide) is
//     never in it (the untested ≠ non-significant rule).
//
// COLOUR — VIBRANT (2026-07-24, KC "don't hold back"). GTA-bright blip palette: 5 full-
// saturation hues, maximally distinct (min pairwise ΔE 57). PHYSICS the report states in full:
// a vivid hue is mid-luminance and CANNOT clear WCAG 4.5:1 vs the mid-tone grey/pink grounds
// (max ~2.9:1). The floor is met the way KC's halo lever intends — a DARK local casing per dot
// (the cream casing works for DARK dots; BRIGHT dots need a DARK boundary): the casing clears
// every ground (6.4–16.7) and each bright fill clears the casing (5.1–9.9), so every dot READS
// on both grounds without darkening (muting) the palette. Literal fill-vs-ground 4.5:1 would
// require a dark basemap flatten (bigger, non-paint change — flagged for KC, not taken here).
// Tokens mirrored in DESIGN_SYSTEM.md §1.3, FLAGGED for ratification.
// =============================================================================

import { CLUSTER_CASING } from "./businessCensusGround.js";

export const CLUSTER_SRC      = "bc-clusters";
export const CLUSTER_GLOW_ID  = "bc-clusters-glow";     // experimental accent (reversible)
export const CLUSTER_FAINT_ID = "bc-clusters-faint";
export const CLUSTER_PROM_ID  = "bc-clusters-prominent";

export const CLUSTER_MAX_SELECT = 5;   // selection cap = palette length

// The View-2 GTA-bright palette — { sig (the finding), faint (baseline) } per trade, in
// selection order. Entry 0 (blue) is the single-select colour.
export const CLUSTER_PALETTE = [
  { sig: "#4d7cff", faint: "#9db3ff" },   // blue
  { sig: "#00c9b5", faint: "#6fded1" },   // teal
  { sig: "#ff3d9e", faint: "#ff9ccb" },   // magenta
  { sig: "#00d95a", faint: "#74e89f" },   // green
  { sig: "#ff7a1a", faint: "#ffbb80" },   // orange
];
// The dot CASING — a DARK near-black boundary (businessCensusGround CLUSTER_CASING) that carries the
// point-symbol accessibility: it lets the bright vivid fills read on any warm ground (WCAG 1.4.11
// Non-text Contrast measured against the casing, DESIGN_SYSTEM §4), since a saturated hue cannot
// clear the 4.5:1 text floor against a mid-tone warm ground.
const SIG_CASING = CLUSTER_CASING;

const wrap = (i) => ((i % CLUSTER_PALETTE.length) + CLUSTER_PALETTE.length) % CLUSTER_PALETTE.length;
export const paletteSig   = (i) => CLUSTER_PALETTE[wrap(i)].sig;    // list/panel swatch
export const paletteFaint = (i) => CLUSTER_PALETTE[wrap(i)].faint;
export const SIG_INDIGO    = CLUSTER_PALETTE[0].sig;                // single-select significant hue (name kept)

const MATCH_NONE = ["in", ["get", "industry_group"], ["literal", []]];

export function clusterFilter(selectedTrades, state) {
  if (!selectedTrades.length) return MATCH_NONE;
  return ["all",
    ["in", ["get", "industry_group"], ["literal", selectedTrades]],
    ["==", ["get", "lclq_state"], state]];
}

// Per-selection colour: single-select → palette[0]; multi-select → each trade its own palette hue
// (`match` on the unique industry-group name). `sig` for prominent + glow, `faint` for the baseline.
function paletteColour(selectedTrades, key) {
  if (selectedTrades.length <= 1) return CLUSTER_PALETTE[0][key];
  const arms = [];
  selectedTrades.forEach((g, i) => arms.push(g, CLUSTER_PALETTE[wrap(i)][key]));
  return ["match", ["get", "industry_group"], ...arms, CLUSTER_PALETTE[0][key]];
}
export const sigColour   = (selectedTrades) => paletteColour(selectedTrades, "sig");
export const faintColour = (selectedTrades) => paletteColour(selectedTrades, "faint");

// §2 FAINT FIX — the baseline scales DOWN, and OPACITY responds INVERSELY to trade volume: a
// high-volume trade (Lessors, ~1,083 non-significant) would otherwise drown its significant
// cluster in a wall of colour, so its faint goes very light; a small trade keeps a readable
// baseline. Clamped so faint stays visible for the relative read but always clearly subordinate.
export function faintOpacityForVolume(nonSigCount) {
  if (!nonSigCount || nonSigCount <= 0) return 0.4;
  return Math.max(0.12, Math.min(0.4, (0.4 * 150) / nonSigCount));
}

// ── TUNABLE knobs ────────────────────────────────────────────────────────────
const PROM_RADIUS   = ["interpolate", ["linear"], ["zoom"], 10, 6, 13, 9, 17, 14];
// FAINT smaller (§2) — clearly subordinate to significant by size as well as opacity.
const FAINT_RADIUS  = ["interpolate", ["linear"], ["zoom"], 10, 3, 13, 4, 17, 5.5];
const PROM_STROKE_W = ["interpolate", ["linear"], ["zoom"], 10, 1.4, 13, 2.0, 16, 2.8];
const PROM_OPACITY  = 0.92;   // near-solid vivid fill; the dark casing + size carry the density read

// ── Experimental glow accent (reversible; unchanged from prior iteration) ─────
export const GLOW_ENABLED = true;
const GLOW_RADIUS  = ["interpolate", ["linear"], ["get", "lclq"], 3, 8, 30, 13, 100, 18];
const GLOW_BLUR    = 1.0;
const GLOW_OPACITY = ["interpolate", ["linear"], ["zoom"], 12.5, 0, 14, 0.06, 17, 0.12];
export function clusterGlowLayer() {
  return {
    id: CLUSTER_GLOW_ID, type: "circle", source: CLUSTER_SRC, filter: MATCH_NONE,
    paint: {
      "circle-color": CLUSTER_PALETTE[0].sig,   // page sets sigColour
      "circle-radius": GLOW_RADIUS, "circle-blur": GLOW_BLUR, "circle-opacity": GLOW_OPACITY,
      "circle-opacity-transition": { duration: 0 }, "circle-radius-transition": { duration: 0 },
    },
  };
}

// FAINT layer — non-significant same-trade baseline. Colour + opacity set per selection (page).
export function clusterFaintLayer() {
  return {
    id: CLUSTER_FAINT_ID, type: "circle", source: CLUSTER_SRC, filter: MATCH_NONE,
    paint: {
      "circle-color": CLUSTER_PALETTE[0].faint,
      "circle-radius": FAINT_RADIUS,
      "circle-opacity": 0.3,
      "circle-opacity-transition": { duration: 0 }, "circle-radius-transition": { duration: 0 },
    },
  };
}

// PROMINENT layer — significant members, the finding. LARGE vivid dots with a DARK casing (the
// local boundary that lets bright fills read on any ground) + semi-solid fill. Instant, no motion.
export function clusterProminentLayer() {
  return {
    id: CLUSTER_PROM_ID, type: "circle", source: CLUSTER_SRC, filter: MATCH_NONE,
    paint: {
      "circle-color": CLUSTER_PALETTE[0].sig,
      "circle-radius": PROM_RADIUS,
      "circle-opacity": PROM_OPACITY,
      "circle-stroke-color": SIG_CASING,
      "circle-stroke-width": PROM_STROKE_W,
      "circle-opacity-transition": { duration: 0 }, "circle-radius-transition": { duration: 0 },
      "circle-stroke-color-transition": { duration: 0 }, "circle-stroke-width-transition": { duration: 0 },
    },
  };
}
