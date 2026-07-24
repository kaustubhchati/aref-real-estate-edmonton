// =============================================================================
// BusinessCensusSection.jsx
//
// The Business Census section ("/economy/business-census") — ONE dataset, ONE
// point layer, THREE user-selected views, each labelled for what it is
// (BC_frontend_spec_LOCKED_20260723.md Part 0):
//
//   1. Business Census   — "the data"            (shows)      — COMPLETE (this file)
//   2. Industry Clusters — "a finding"           (tests)      — data list wired; map
//                                                               lighting + metrics next
//   3. Business Groupings — "an editorial lens"  (interprets) — placeholder
//
// View switching is user-selected and INDEPENDENT of zoom (spec Part 0 / Part 4:
// zoom carries density, never mode). Each view carries a BANNER stating its
// epistemic status, and EACH VIEW HAS ITS OWN PALETTE — shared colours across
// views would imply shared meaning (spec Part 0).
//
// This scaffolds all three views up front so the structure is visible even where
// content is absent. View 1 is complete except the wide-zoom KDE dominance surface
// (spec §1.1), which is a client-side computation whose VIABILITY must be measured
// before it is built (spec §2.2 / the CC report) — flagged, not stubbed silently.
//
// Follows the Building Permits point-mount precedent: composes the shared MapView
// with a per-section style module (businessCensusPointsStyle.js); does not extend
// MapView, does not share the style module with PA/BP (spec Part 6).
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import MapView, { findFirstSymbolLayerId } from "../../components/MapView.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import IdentityCard from "../../components/IdentityCard.jsx";
import SegmentedControl from "../../components/SegmentedControl.jsx";
import { HOME_VIEW, applyCameraPreset } from "../../components/mapCamera.js";
import { makeIconButtonControl, railGlyph } from "../../components/mapControls.js";
import { ICON_RECENTRE } from "../../components/mapIcons.js";
import { siteConfig } from "../../config/siteConfig.js";
import { assetUrl } from "../../utils/assetUrl.js";
import { parseCsvAsObjects } from "../report-card/parseCsv.js";
import {
  BASEMAP_STYLE,
  MAP_VIEW,
  LAYER_ID,
  SOURCE_ID,
  deriveSectorDomain,
  buildColourExpression,
  pointCircleLayer,
  pointHaloLayer,
  pointSelectLayer,
  HALO_LAYER_ID,
  SELECT_LAYER_ID,
  HALO_OPACITY,
  POINT_OPACITY,
  OTHER_KEY,
} from "./businessCensusPointsStyle.js";
import {
  rankTradesByShareSignificant,
  lclqMultiplierPhrase,
  clusterStrengthPhrase,
  buildSignificanceIndex,
  buildClusterFeatures,
  tradeDetail,
} from "./industryClustersData.js";
import {
  CLUSTER_SRC,
  CLUSTER_GLOW_ID,
  CLUSTER_FAINT_ID,
  CLUSTER_PROM_ID,
  CLUSTER_MAX_SELECT,
  GLOW_ENABLED,
  clusterGlowLayer,
  clusterFaintLayer,
  clusterProminentLayer,
  clusterFilter,
  sigColour,
  faintColour,
  faintOpacityForVolume,
  paletteSig,
} from "./industryClustersStyle.js";
import { THEME, applyDeepenedGround } from "./businessCensusGround.js";
import { deriveDistrictBoundaries, deriveDistrictLabels } from "./businessCensusDistricts.js";
import BusinessCensusInfoRail from "./BusinessCensusInfoRail.jsx";
import BusinessCensusLegend from "./BusinessCensusLegend.jsx";
import BusinessCensusConsole from "./BusinessCensusConsole.jsx";
import { deriveAggregates } from "./businessCensusAggregates.js";
import { titleCase } from "./titleCase.js";

// Selecting a sector FILTERS the point layers to the selection — the non-selected points are
// REMOVED from the layer (a `setFilter`), not just painted transparent (KC 2026-07-24). Two
// reasons: (1) an earlier 0.1 mute accumulated over the coloured KDE wash into grey sludge;
// (2) opacity 0 hides a point VISUALLY but leaves it in the layer, so it is still hit-testable —
// hovering apparently-empty map returned InfoRail readings for undrawn businesses. A filter
// takes them out of the render AND the hit-test set, fixing both.
//
// `setFilter` is NOT `setData` — it changes which features a layer draws, never the source data
// (setData on a React-managed source corrupts tile state — the BP mode-B lesson). And it does
// NOT contradict the mute-not-FILTER ruling, which was about the SURFACE: filtering the surface
// makes dominance (a comparison) meaningless against hidden categories, so the surface is never
// filtered. Filtering only the POINTS touches no source and no surface — the surface stays
// byte-identical to the unselected state. Two consistent rulings: surface always shows all;
// points show the selection.

const POINTS_URL = assetUrl("/data/economy/business_census_points_2025.geojson");
const LCLQ_URL = assetUrl("/data/economy/bc_lclq_industry_group.csv");

// The three views (spec Part 0). `status` is the epistemic banner; `icon` is a
// single SVG path for the SegmentedControl (24×24 stroke). One active at a time.
const VIEWS = [
  { key: "census",    label: "Business Census",   status: "the data",
    icon: "M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4 M9 9v.01 M9 12v.01 M9 15v.01 M9 18v.01" },
  { key: "clusters",  label: "Industry Clusters", status: "a finding",
    icon: "M9 3v18 M15 3v18 M3 9h18 M3 15h18" },
  { key: "groupings", label: "Business Groupings", status: "an editorial lens",
    icon: "M3 7h7v7H3z M14 7h7v4h-7z M14 14h7v3h-7z" },
];

// View 1 wide-zoom character surface (spec §1.1). The three EXPOSED parameters
// (spec Part 7 items 2–3) + their ranges; defaults from the measurement (250 m /
// 200 m read well and stay sub-frame). The surface fill sits UNDER the points and
// carries CONSTANT opacity (spec §1.1: KEEP IT RAW — no zoom fade).
const SURFACE_SRC = "bc-surface", SURFACE_LYR = "bc-surface-fill";
// High opacity is fine now that figure-ground comes from LIGHTNESS (light surface,
// dark points), not from a muddy low opacity (KC). A touch of translucency keeps it
// a light ground rather than a hard cover.
// Variant-aware: on the DARK ground the KDE wash drops so the dark ground shows through the
// character tint (a near-opaque light wash tuned for cream would just re-lighten the dark ground).
const SURFACE_OPACITY = THEME.surfaceOpacity;
// Dominance = the single↔two-way hue split (lead over runner-up); LOWERED from 0.65
// (too demanding — KC). Grey no longer comes from this (it now comes from low
// dominance STRENGTH = a muddy three-way), so this only controls single-vs-blend hue.
const KDE_DEFAULTS = { cellSize: 250, bandwidth: 200, domThreshold: 0.6 };

// STRUCTURES vs ZONES (KC ruling): on the census view, hide the ZONE/AREA fills — they
// blanket whole districts (mid-dark, translucent), which muddied the KDE compositing AND
// produced the point-contrast failure against `landuse_industrial` (#8b98a7). But KEEP
// the building FOOTPRINTS (building / building-top): small, discrete structures that only
// render at z15+, giving "which building is this business in" orientation without a
// district-sized wash under the surface. So building* is NOT in this hidden list.
// Water, roads and labels also stay. Toggled back to visible on the other views (ordinary
// maps). Visibility-only, so the layers' paint is preserved for restore.
//
// CONTRAST (KC §1.3), two fills, two verdicts:
//   • landuse_industrial #8b98a7 — the 1.7–2.1:1 FAILURE. Stays HIDDEN here, so it is
//     UNREACHABLE on the census view; the failure cannot occur. Note kept, made explicit.
//   • building #ece3ca (the Apple-Classic restyle colour, basemapTheme.js — NOT the raw
//     JSON #e4dcd0) — now ENABLED. Measured over it: the 4 vivid consumer hues clear 4.5:1
//     (4.82–5.01); the 6 cooler hues fall JUST below (4.06–4.45), all still ≥ the 3:1
//     WCAG non-text-marker floor (SC 1.4.11). z15+ only; the cream halo can't lift it (halo
//     ≈ building colour). Surfaced to KC — see the CC report. Re-measure if the restyle's
//     building colour changes, or if any zone fill is ever moved out of this list.
const HIDDEN_ZONE_FILLS = [
  "landcover", "park_national_park", "park_nature_reserve",
  "landuse_residential", "landuse", "landuse_commercial", "landuse_industrial",
  "landuse_institutional",
];

// Basemap STRUCTURAL EMPHASIS — the counterpart to hiding the zone fills: buildings +
// LINEAR infrastructure that orient the reader WITHOUT shading a district. Applied once in
// onLoad (MapView runs the Apple-Classic theme FIRST, then this), scoped to THIS map only so
// the shared basemap that PA/BP/DU load is untouched. Paint/zoom-range only, no new layers.
//
// Buildings CANNOT render below z13 — Carto ships no building geometry there (measured: 0
// features ≤ z12.5, 6 at z13, 369 at z14). So "earlier" means: the moment the data exists
// (z13) the footprints read as SOLID buildings instead of the roof highlight staying near-
// invisible until z16. The flat footprint (`building`) already draws at full opacity from
// z13; only its dimensional top (`building-top`) faded in late — brought forward here.
// Rail / aeroway / paths are linear features already in the style but left a faint hairline
// by the theme; nudged to read, they carry orientation through the z13–14 gap before
// buildings get dense. None of these shade an area.
function emphasizeStructures(m) {
  try {
    // (1) BUILDINGS read as present (KC: were too faint). Two moves, both contrast-checked:
    //   • a DELINEATING OUTLINE (fill-outline-color) — the main weight add: it draws each
    //     footprint's edge so buildings read as shapes even where the fill nearly matches the
    //     cream ground. An outline is a thin edge, so it barely touches the point-on-fill contrast.
    //   • a MODEST fill DARKEN (theme #ece3ca → #e4d8bb) for body weight. This DOES change the
    //     ground under the points, so the point contrast is re-checked (CC report): the dark
    //     point band stays above the §4 3:1 graphical-mark floor over the new fill.
    for (const id of ["building", "building-top"]) {
      if (m.getLayer(id)) m.setPaintProperty(id, "fill-color", "#e4d8bb");
    }
    if (m.getLayer("building")) m.setPaintProperty("building", "fill-outline-color", "#a89768");
    if (m.getLayer("building-top")) {
      m.setPaintProperty("building-top", "fill-opacity",
        ["interpolate", ["linear"], ["zoom"], 13, 0.7, 14, 1]);   // roof reads solid sooner
    }
    // (2) RAIL — bolder orientation lines: DARKER + WIDER (was a pale #8f8468 hairline).
    if (m.getLayer("rail")) {
      m.setLayerZoomRange("rail", 12, 24);          // let them start as soon as any geometry exists
      m.setPaintProperty("rail", "line-color", "#6f6444");
      m.setPaintProperty("rail", "line-width",
        ["interpolate", ["linear"], ["zoom"], 13, 1.2, 14, 2.2, 16, 4.2, 21, 8]);
    }
    // (3) airport runways/taxiways + off-street paths — more present (still recessive vs data).
    for (const id of ["aeroway-runway", "aeroway-taxiway", "road_path"]) {
      if (m.getLayer(id)) m.setPaintProperty(id, "line-color", "#9a8c64");
    }
  } catch { /* map tearing down */ }
}

// ── Neighbourhood reference overlay (KC: "map info features like neighbourhood") ──────
// The canonical 407-neighbourhood boundary — the shared base geometry (§3), published
// under property-assessment — drawn as a SUBTLE administrative outline + name labels.
// ZOOM-STAGED: a whisper at the city overview (where the points own the frame), revealing
// as you zoom into a district, so it INFORMS without fighting the data. MapLibre labels
// each polygon at its own centroid (symbol-placement point) and auto-hides overlaps, so
// more names appear the closer you look — no client-side centroid/label-thinning needed.
// Toggleable (default on). The points stay ABOVE it (§1.3) — re-lifted after it installs.
const NBHD_URL   = assetUrl("/data/property-assessment/neighbourhoods_2026_recovered.geojson");
const NBHD_SRC   = "bc-nbhd";
const NBHD_LINE  = "bc-nbhd-line";
const NBHD_LABEL = "bc-nbhd-label";
// A fontstack that is DECLARED in the basemap style (so its glyphs are served) — the
// "Medium" variant, a touch heavier than the Carto suburb labels it sits beside.
const NBHD_FONT  = ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular",
  "HanWangHeiLight Regular", "NanumBarunGothic Regular"];

function neighbourhoodLineLayer() {
  return {
    id: NBHD_LINE, type: "line", source: NBHD_SRC,
    layout: { "line-join": "round" },
    paint: {
      "line-color": THEME.nbhdLine,   // administrative line — variant-aware (warm ink / light on dark)
      "line-width":   ["interpolate", ["linear"], ["zoom"], 10, 0.4, 13, 0.8, 16, 1.3],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.1, 11.5, 0.3, 14, 0.42],
    },
  };
}
function neighbourhoodLabelLayer() {
  return {
    id: NBHD_LABEL, type: "symbol", source: NBHD_SRC, minzoom: 11,
    layout: {
      "text-field": ["get", "display_name"],   // already the uppercase neighbourhood name
      "text-font": NBHD_FONT,
      "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9.5, 14, 12.5],
      "text-letter-spacing": 0.05,
      "text-max-width": 7,
      "text-padding": 3,
    },
    paint: {
      "text-color": THEME.nbhdInk,        // neighbourhood name ink — variant-aware
      "text-halo-color": THEME.overlayHalo,   // cream on warm / dark on the dark ground
      "text-halo-width": 1.4,
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 11.7, 1],  // fade in just above minzoom
    },
  };
}

// ── District reference overlay — the COARSER unit, NESTING above neighbourhoods ───────
// Derived from the neighbourhood partition by edge-cancellation (businessCensusDistricts.js
// — no library, no backend). Reads as the HEAVIER tier: bolder/darker boundary + a big
// spaced name, present at the CITY OVERVIEW and handing off to neighbourhoods as you zoom
// (district labels fade out + drop by ~z12, exactly as the finer neighbourhood names fade
// in). Two GeoJSON sources — the boundary MultiLineString + the 15 centroid label points.
const DISTRICT_LINE_SRC  = "bc-district-line-src";
const DISTRICT_LABEL_SRC = "bc-district-label-src";
const DISTRICT_LINE      = "bc-district-line";
const DISTRICT_LABEL     = "bc-district-label";

function districtLineLayer() {
  return {
    id: DISTRICT_LINE, type: "line", source: DISTRICT_LINE_SRC,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": THEME.districtLine,   // coarse-tier boundary — variant-aware
      "line-width":   ["interpolate", ["linear"], ["zoom"], 8, 0.8, 12, 1.7, 16, 2.6],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 11, 0.5, 14, 0.55],
    },
  };
}
function districtLabelLayer() {
  return {
    // maxzoom 12: districts are GONE (not just transparent) past z12, so their label boxes
    // never steal collision space from the neighbourhood names taking over.
    id: DISTRICT_LABEL, type: "symbol", source: DISTRICT_LABEL_SRC, minzoom: 8, maxzoom: 12,
    layout: {
      "text-field": ["get", "district"],
      "text-font": NBHD_FONT,
      "text-size": ["interpolate", ["linear"], ["zoom"], 8.5, 12, 11, 17],
      "text-transform": "uppercase",
      "text-letter-spacing": 0.14,   // wide tracking = the "region name" register, distinct from neighbourhoods
      "text-max-width": 8,
    },
    paint: {
      "text-color": THEME.districtInk,
      "text-halo-color": THEME.overlayHalo,
      "text-halo-width": 1.8,
      // visible at overview, fade OUT before the neighbourhood names (z11) get prominent
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 8.5, 0, 9, 0.92, 10.5, 0.92, 11.8, 0],
    },
  };
}

// ── City label — a custom "Edmonton" overview label (KC) ──────────────────────────────────
// The basemap's own Edmonton label is COLLISION-SUPPRESSED at the home zoom (the district /
// neighbourhood overlay labels win the central space) and, when it does show, it is BURIED by
// the dense point cloud. So we draw our OWN: one always-on point on the RIVER VALLEY (where the
// points are sparse, so the name reads), rendered ABOVE the points, only at the overview zoom
// band (fades out as the neighbourhood names take over). allow-overlap + ignore-placement so it
// is never dropped by the collision index.
const CITY_LABEL_SRC = "bc-city-label-src";
const CITY_LABEL     = "bc-city-label";
const CITY_LABEL_GEOJSON = {
  type: "FeatureCollection",
  features: [{
    type: "Feature", properties: { name: "Edmonton" },
    geometry: { type: "Point", coordinates: [-113.4990, 53.5300] },   // river valley, central on the home view
  }],
};
function cityLabelLayer() {
  return {
    id: CITY_LABEL, type: "symbol", source: CITY_LABEL_SRC, minzoom: 9, maxzoom: 12.2,
    layout: {
      "text-field": ["get", "name"],
      "text-font": NBHD_FONT,
      "text-size": ["interpolate", ["linear"], ["zoom"], 9, 15, 11, 21],   // city tier — bigger than districts
      "text-transform": "uppercase",
      "text-letter-spacing": 0.2,
      "text-allow-overlap": true,        // ALWAYS render — never collision-dropped
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": THEME.cityInk,       // city label ink — variant-aware
      "text-halo-color": THEME.overlayHalo,
      "text-halo-width": 2.4,
      // present at the overview, fade out before the neighbourhood names get prominent (~z12)
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0, 9.6, 1, 11.4, 1, 12.2, 0],
    },
  };
}

export default function BusinessCensusSection() {
  const [view, setView] = useState("census");
  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [lclqRows, setLclqRows] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [nbhdGj, setNbhdGj] = useState(null);      // neighbourhood reference geometry
  const [consoleOpen, setConsoleOpen] = useState(false);   // bottom data console (pull-up, PA pattern)
  const [selectedFeature, setSelectedFeature] = useState(null); // InfoRail PINNED detail + map ring
  const [hoveredFeature, setHoveredFeature] = useState(null);   // InfoRail hover PREVIEW (reverts to pin on exit)
  // Legend/console MUTE state (kept separate from the InfoRail pin — they coexist, §Phase 4):
  // ONE selection state (PA model): the SELECTED SECTOR drives the wheel highlight, the console
  // drill, AND the map mute together (click a wheel segment OR a console sector row → same
  // state). `selectedGroup` is the deeper level (drill into an industry group → mute to it).
  const [selectedSector, setSelectedSector] = useState(null);              // the selected sector (single)
  const [hoveredSector, setHoveredSector] = useState(null);                // wheel hover highlight (local)
  const [selectedGroup, setSelectedGroup] = useState(null);                // industry-group mute (deeper)
  const [selectedTrades, setSelectedTrades] = useState([]);                // VIEW 2: chosen trades (cap CLUSTER_MAX_SELECT)

  const activeView = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  // VIEW 2 · toggle a trade in/out of the lit selection (spec §2.1/§2.3). Multi-select is
  // capped at CLUSTER_MAX_SELECT (G3 colour budget) — a pick beyond the cap is ignored.
  function toggleTrade(group) {
    setSelectedTrades((cur) => {
      if (cur.includes(group)) return cur.filter((g) => g !== group);
      if (cur.length >= CLUSTER_MAX_SELECT) return cur;
      return [...cur, group];
    });
  }
  // Switch view; leaving View 2 clears the lit selection so a return starts at the rest state
  // (blank map). Done in the handler, not an effect (setState-in-effect is disallowed).
  function changeView(next) {
    if (next !== "clusters") setSelectedTrades([]);
    setView(next);
  }

  // ── Data: points (all views' source) + LCLQ (view 2's finding) ─────────────
  // Points once — View 1's sector colour domain + the map source. (Spec Part 6:
  // performance is not a constraint at ~29,894 constant-radius circles.)
  useEffect(() => {
    let cancelled = false;
    fetch(POINTS_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`); return r.json(); })
      .then((data) => { if (!cancelled) setGj(data); })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // LCLQ CSV — View 2's choosable list (the finding). Loaded lazily is unnecessary
  // (5 MB, parsed once); a failure just leaves View 2's list empty (logged, not
  // fatal — View 1 still works).
  useEffect(() => {
    let cancelled = false;
    fetch(LCLQ_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then((text) => { if (!cancelled) setLclqRows(parseCsvAsObjects(text)); })
      .catch((err) => console.error("[BusinessCensusSection] LCLQ load:", err.message));
    return () => { cancelled = true; };
  }, []);

  // Neighbourhood boundary — the reference-overlay geometry (loaded once; a failure just
  // leaves the overlay absent, non-fatal — the points map still works).
  useEffect(() => {
    let cancelled = false;
    fetch(NBHD_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { if (!cancelled) setNbhdGj(data); })
      .catch((err) => console.error("[BusinessCensusSection] neighbourhood overlay load:", err.message));
    return () => { cancelled = true; };
  }, []);

  // View 1 colour domain (sectors ranked → OKLCH hues; "Other"; nulls).
  const domain = useMemo(() => (gj ? deriveSectorDomain(gj.features) : null), [gj]);
  // Point stack (bottom→top): the selection RING (pinned point) · the cream HALO casing ·
  // the dark DOT figure — all on the one points source. The page lifts all three above the
  // basemap + overlays (§1.3), and sets the ring's filter to the pinned objectid.
  const layers = useMemo(
    () => (domain ? [pointSelectLayer(), pointHaloLayer(), pointCircleLayer(buildColourExpression(domain))] : null),
    [domain],
  );
  // View-1 aggregates (sector/industry-group counts + shares + families) — client-computed
  // from the loaded features; drives the interactive legend + the data console.
  const aggregates = useMemo(
    () => (gj && domain ? deriveAggregates(gj.features, domain) : null), [gj, domain]);

  // SELECT a sector (from the wheel OR a console rest row — one action): it filters the map to
  // that sector AND drills the console into it. Toggling the same sector clears it. Clears any
  // deeper group selection. (PA model: one click, one state, drives every surface.)
  // A pin the new selection would FILTER OUT is cleared here (KC: a pin on a now-hidden dot
  // points at nothing — worse than a cleared pin). A pin that stays visible (same sector/group)
  // survives. Handled in the handlers, not an effect (setState-in-effect is disallowed).
  function selectSector(key) {
    const next = selectedSector === key ? null : key;
    setSelectedGroup(null);
    setSelectedSector(next);
    if (selectedFeature && next != null && selectedFeature.colour_key !== next) setSelectedFeature(null);
  }
  // Breadcrumb ‹ All Sectors — back to the unfiltered state (all points shown; a pin stays valid).
  function clearSelection() { setSelectedSector(null); setSelectedGroup(null); }
  // Drill one level deeper: toggle the industry-group filter. A pin outside the group is cleared.
  function selectGroup(group) {
    const next = selectedGroup === group ? null : group;
    setSelectedGroup(next);
    if (selectedFeature && next != null && selectedFeature.industry_group !== next) setSelectedFeature(null);
  }

  // View 2 finding: trades ranked by SHARE SIGNIFICANT (spec §2.1) — NOT count.
  const trades = useMemo(() => (lclqRows ? rankTradesByShareSignificant(lclqRows) : null), [lclqRows]);
  // View 2 MAP source — the points joined to the LCLQ result by objectid, client-side
  // (recon §4). `clusterFC` carries ONLY tested businesses, each tagged sig/nonsig +
  // multiplier; an untested business is absent by construction (never drawn).
  const sigIndex = useMemo(() => (lclqRows ? buildSignificanceIndex(lclqRows) : null), [lclqRows]);
  const clusterFC = useMemo(
    () => (gj && sigIndex ? buildClusterFeatures(gj.features, sigIndex) : null), [gj, sigIndex]);

  // District geometry — derived once from the neighbourhood partition (edge-cancellation).
  const districtLines  = useMemo(() => (nbhdGj ? deriveDistrictBoundaries(nbhdGj) : null), [nbhdGj]);
  const districtLabels = useMemo(() => (nbhdGj ? deriveDistrictLabels(nbhdGj) : null), [nbhdGj]);

  // ── View 1 · KDE dominance surface (spec §1.1) ─────────────────────────────
  // Params are SETTLED (KC): the Detail/Smoothing/Dominance sliders were removed, so the
  // surface computes once at the hardcoded KDE_DEFAULTS (250 m / 200 m / 60 %).
  const kdeParams = KDE_DEFAULTS;
  const [surfaceImg, setSurfaceImg] = useState(null);   // { url, coordinates } — the KDE raster

  // Worker inputs, built ONCE from the points + palette: coords as typed arrays and
  // each point's category — a NAMED-sector index (≥0), -1 for "Other" (tracked but
  // OUT of the argmax, per KC), or -2 for null/Unclassified (dropped). Plus the OKLCH
  // palette. Reused across every parameter change (no re-extract).
  const kdeInput = useMemo(() => {
    if (!gj || !domain) return null;
    const idx = new Map(domain.sectors.map((s, i) => [s.key, i]));
    const N = gj.features.length;
    const lon = new Float32Array(N), lat = new Float32Array(N), cat = new Int16Array(N);
    for (let i = 0; i < N; i++) {
      const f = gj.features[i];
      lon[i] = f.geometry.coordinates[0]; lat[i] = f.geometry.coordinates[1];
      const ck = f.properties.colour_key;
      cat[i] = idx.has(ck) ? idx.get(ck) : (ck === OTHER_KEY ? -1 : -2);
    }
    return { lon, lat, cat, palette: domain.sectors.map((s) => s.oklch) };
  }, [gj, domain]);

  // The worker (off the main thread so live tuning never hitches the map — the
  // measured viability ruling). A monotone token drops a stale result if the
  // parameters changed while it was computing.
  const workerRef = useRef(null);
  const kdeTokenRef = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL("./businessCensusKde.worker.js", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      if (e.data.token !== kdeTokenRef.current) return;   // superseded by a newer param set
      // Paint the worker's RGBA raster onto a tiny canvas → data URL for a MapLibre
      // image source (rendered with bilinear resampling below). W×H is ~120×175, so
      // this is sub-millisecond main-thread work.
      const { rgba, width, height, coordinates } = e.data;
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);
      setSurfaceImg({ url: canvas.toDataURL(), coordinates });
      // Surface the measured co-occurrence (the top-two sector pair tallied over
      // every cell) — the INPUT to the deferred §1.1 palette-arrangement decision,
      // kept (not discarded) so that ratification has its data.
      if (import.meta.env.DEV) {
        console.debug("[KDE] stats", e.data.stats, "coocc", e.data.coocc);
        window.__kdeComputes = (window.__kdeComputes || 0) + 1;
        window.__kdeStats = e.data.stats;
        window.__kdeCoocc = e.data.coocc;
      }
    };
    workerRef.current = w;
    return () => { w.terminate(); workerRef.current = null; };
  }, []);

  // Compute the surface when the census view is active + inputs/params are ready.
  useEffect(() => {
    if (view !== "census" || !kdeInput || !workerRef.current) return;
    const token = ++kdeTokenRef.current;
    // Post a COPY (no transfer) so kdeInput stays reusable across parameter changes.
    workerRef.current.postMessage({
      lon: kdeInput.lon, lat: kdeInput.lat, cat: kdeInput.cat,
      palette: kdeInput.palette, params: kdeParams, token,
    });
  }, [view, kdeInput, kdeParams]);

  // Add / recreate the KDE RASTER as an image source + a raster layer with BILINEAR
  // resampling (the cartographic standard for a continuous density surface: seams
  // smoothed for display only). Inserted BELOW "water" so the river/lakes stay on
  // top for orientation; the points sit at the very top of the stack (handleMapLoad),
  // and the light surface L recedes behind them (figure-ground by lightness). Recreate
  // (never mutate) — coordinates change with the bandwidth pad.
  useEffect(() => {
    if (!map) return;
    try {
      if (map.getLayer(SURFACE_LYR)) map.removeLayer(SURFACE_LYR);
      if (map.getSource(SURFACE_SRC)) map.removeSource(SURFACE_SRC);
      if (view === "census" && surfaceImg) {
        map.addSource(SURFACE_SRC, { type: "image", url: surfaceImg.url, coordinates: surfaceImg.coordinates });
        const beforeId = map.getLayer("water") ? "water" : findFirstSymbolLayerId(map);
        map.addLayer({
          id: SURFACE_LYR, type: "raster", source: SURFACE_SRC,
          paint: { "raster-resampling": "linear", "raster-opacity": SURFACE_OPACITY, "raster-fade-duration": 0 },
        }, beforeId);
      }
    } catch { /* map tearing down */ }
  }, [map, view, surfaceImg]);

  // Hide the ZONE/area fills on the census view so the KDE surface reads on a clean ground
  // (building footprints stay — see HIDDEN_ZONE_FILLS); restore all on other views.
  useEffect(() => {
    if (!map) return;
    const vis = view === "census" ? "none" : "visible";
    try {
      for (const id of HIDDEN_ZONE_FILLS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      }
    } catch { /* map tearing down */ }
  }, [map, view]);

  // Install the reference overlays once the geometry + map are ready (added, then the
  // points re-lifted so they sit above the surface/basemap but UNDER the dots, §1.3).
  // Z-order: neighbourhood line → district line (bolder, on top of the fine lines) →
  // neighbourhood label → district label. Labels are zoom-separated (districts ≤ z12,
  // neighbourhoods ≥ z11), so the small overlap resolves by collision with no clutter.
  useEffect(() => {
    if (!map || !nbhdGj || !districtLines || !districtLabels) return;
    try {
      if (!map.getSource(NBHD_SRC)) map.addSource(NBHD_SRC, { type: "geojson", data: nbhdGj });
      if (!map.getSource(DISTRICT_LINE_SRC)) map.addSource(DISTRICT_LINE_SRC, { type: "geojson", data: districtLines });
      if (!map.getSource(DISTRICT_LABEL_SRC)) map.addSource(DISTRICT_LABEL_SRC, { type: "geojson", data: districtLabels });
      if (!map.getLayer(NBHD_LINE)) map.addLayer(neighbourhoodLineLayer());
      if (!map.getLayer(DISTRICT_LINE)) map.addLayer(districtLineLayer());
      if (!map.getLayer(NBHD_LABEL)) map.addLayer(neighbourhoodLabelLayer());
      if (!map.getLayer(DISTRICT_LABEL)) map.addLayer(districtLabelLayer());
      for (const id of [SELECT_LAYER_ID, HALO_LAYER_ID, LAYER_ID]) if (map.getLayer(id)) map.moveLayer(id);
      // The city label ("Edmonton") sits ABOVE the points (KC — it must not be buried). Added
      // last, then moved to the very top so it stays above the just-re-lifted points even when
      // this effect re-runs.
      if (!map.getSource(CITY_LABEL_SRC)) map.addSource(CITY_LABEL_SRC, { type: "geojson", data: CITY_LABEL_GEOJSON });
      if (!map.getLayer(CITY_LABEL)) map.addLayer(cityLabelLayer());
      map.moveLayer(CITY_LABEL);
    } catch { /* map tearing down */ }
  }, [map, nbhdGj, districtLines, districtLabels]);

  // District + Neighbourhood overlays are permanently ON (KC — toggles removed). The layers
  // are added visible by default (their factories set no visibility), so nothing to toggle.

  // Surface the null/unexpected colour_key count (directive: report it). 0 today.
  useEffect(() => {
    if (domain?.nullCount) {
      console.warn(`[BusinessCensusSection] ${domain.nullCount} feature(s) have a null colour_key — shown in the distinct slate, not the "Other" colour.`);
    }
  }, [domain]);

  useEffect(() => {
    document.title = `Business Census · ${activeView.label} · Edmonton 2025`;
    return () => { document.title = "Open Data Centre"; };
  }, [activeView]);

  // ── Map ────────────────────────────────────────────────────────────────────
  const firstHomeRef = useRef(true);
  const recentreAddedRef = useRef(false);   // add the recentre control exactly once
  function handleMapLoad(m) {
    setMap(m);
    if (import.meta.env.DEV) window.__bcMap = m;
    // LAYER-ORDER FIX (spec §1.3, HARD RULE): points sit ABOVE all basemap layers
    // at every zoom. MapView inserts data layers at findFirstSymbolLayerId (below
    // labels), which leaves them UNDER any basemap building/landuse fill. Lift the
    // point layers to the TOP of the stack EXPLICITLY — the cream HALO first, then
    // the DOTS on top of it (moveLayer with no beforeId appends to the end), so the
    // halo sits just under the dots and nothing in the basemap occludes a business.
    for (const id of [SELECT_LAYER_ID, HALO_LAYER_ID, LAYER_ID]) if (m.getLayer(id)) m.moveLayer(id);
    emphasizeStructures(m);   // buildings earlier + linear infrastructure (no area shading)
    // COSMETIC ~10% warm ground-deepening for the point views (this instance only; the choropleth and
    // other sections keep their light ground). Grounding/richness — NOT the contrast mechanism, which
    // is the dark point casing (businessCensusGround; DESIGN_SYSTEM §4).
    applyDeepenedGround(m);
    applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: !firstHomeRef.current });
    firstHomeRef.current = false;
    // RECENTRE control (top-right rail, matching PA) — returns to BC's home view. BC has a
    // DEFINED home view: HOME_VIEW.Edmonton, the shared captured camera (§12 v1.15) the whole
    // load lands on. BC has no neighbourhood selection to fit, so it is always "Return to home
    // view" (PA's state-aware "Fit to selection" has nothing to fit here). Added once on load,
    // after MapView's own zoom/fullscreen controls, so the rail order is zoom · fullscreen ·
    // recentre (PA's tail).
    if (!recentreAddedRef.current) {
      m.addControl(makeIconButtonControl({
        svg: railGlyph(ICON_RECENTRE),
        label: "Return to home view",
        onClick: () => applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: true }),
      }), "top-right");
      recentreAddedRef.current = true;
    }
  }

  // SELECTION = a layer FILTER on both point layers (dot + halo). On census, a selected SECTOR
  // (wheel / console row) or, deeper, a selected industry GROUP filters the layers to matching
  // features — the rest are removed from the render AND the hit-test set, so hovering empty map
  // returns nothing (the opacity-0 hover-ghost bug). HOVER never touches this (KC: it only drives
  // the local wheel highlight, not the map). On non-census views the points are a quiet wash
  // (opacity dim) with NO filter (all shown). `setFilter` is not `setData` and does not reorder
  // layers, so §1.3's moveLayer stack is undisturbed. The surface is never filtered (points only).
  useEffect(() => {
    if (!map) return;
    try {
      if (view !== "census") {
        // VIEW 2 (clusters): HIDE the View-1 points entirely (visibility none) so the rest
        // state is a blank map — nothing lit until a trade is chosen (spec §2.1); the
        // dedicated cluster layers carry the finding. VIEW 3 (groupings): the old dim wash
        // of ALL points, unchanged.
        const hideForClusters = view === "clusters";
        for (const id of [LAYER_ID, HALO_LAYER_ID]) {
          if (!map.getLayer(id)) continue;
          map.setFilter(id, null);
          map.setLayoutProperty(id, "visibility", hideForClusters ? "none" : "visible");
        }
        if (!hideForClusters) {
          if (map.getLayer(LAYER_ID)) map.setPaintProperty(LAYER_ID, "circle-opacity", 0.1);
          if (map.getLayer(HALO_LAYER_ID)) map.setPaintProperty(HALO_LAYER_ID, "circle-opacity", 0);
        }
        return;
      }
      // census: restore the View-1 points to visible (a prior clusters view hid them).
      for (const id of [LAYER_ID, HALO_LAYER_ID]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
      // A ["=="] excludes a null field by construction (null never equals the value), so a
      // null-sector business is correctly dropped from a sector selection with no extra guard
      // (["has"] would LIE about a null-then-stripped key — never use it; see the colour match).
      const filter = selectedGroup != null
        ? ["==", ["get", "industry_group"], selectedGroup]   // industry-group level (deeper)
        : selectedSector != null
          ? ["==", ["get", "colour_key"], selectedSector]    // sector level
          : null;                                            // nothing selected → all shown
      for (const id of [LAYER_ID, HALO_LAYER_ID]) {
        if (!map.getLayer(id)) continue;
        map.setFilter(id, filter);                            // null = pass-everything
      }
      // Opacity stays the constant (filtering, not muting, does the hiding now) — reset it in
      // case a prior non-census dim left it at 0.1/0.
      if (map.getLayer(LAYER_ID)) map.setPaintProperty(LAYER_ID, "circle-opacity", POINT_OPACITY);
      if (map.getLayer(HALO_LAYER_ID)) map.setPaintProperty(HALO_LAYER_ID, "circle-opacity", HALO_OPACITY);
    } catch { /* map tearing down */ }
    // `layers` in deps: if the point layers are ever recreated (source swap), re-apply the
    // filter so it can't be silently dropped (matches the ring-filter effect's deps).
  }, [map, view, selectedSector, selectedGroup, layers]);


  // Bottom Data Console pull-up: T toggles it (PA affordance), except while typing in a field.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "t" && e.key !== "T") return;
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      setConsoleOpen((o) => !o);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Interaction (census view only) — HOVER previews the business in the InfoRail; CLICK PINS it
  // there and rings the dot on the map. The on-map POPUP is REMOVED (KC 2026-07-24): it was a
  // redundant second readout that also occluded the very region being inspected. Same
  // functionality, one surface — the InfoRail owns both hover-preview and click-pin, and the
  // pinned dot stays marked on the map by the violet ring (not a popup anchor).
  useEffect(() => {
    if (!map || view !== "census") return undefined;
    // Preview de-dupe: mousemove fires many times over one dot; re-render the (large) section
    // only when the hovered dot actually CHANGES, so scanning stays smooth.
    let lastHoverId = null;
    function onMove(e) {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties;
      if (props.objectid === lastHoverId) return;   // same dot → no state change
      lastHoverId = props.objectid;
      setHoveredFeature(props);                       // InfoRail shows the preview (hover wins)
    }
    function onLeave() {
      map.getCanvas().style.cursor = "";
      lastHoverId = null;
      setHoveredFeature(null);                        // exit → InfoRail reverts to the pin (or idle)
    }
    function onSelect(e) {
      if (!e.features?.length) return;
      setSelectedFeature(e.features[0].properties);   // pin → InfoRail full detail + map ring
    }
    // Click on empty map (missed every dot) → clear the pin (the InfoRail ✕ is the other way
    // out). A ±4px box matches the layer click's hit tolerance, so a click that DID land on a
    // dot is never mis-read as empty and never fights the select (a 0-tolerance point can).
    function onDismiss(e) {
      const box = [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]];
      if (!map.queryRenderedFeatures(box, { layers: [LAYER_ID] }).length) setSelectedFeature(null);
    }
    map.on("mousemove", LAYER_ID, onMove);
    map.on("mouseleave", LAYER_ID, onLeave);
    map.on("click", LAYER_ID, onSelect);
    map.on("click", onDismiss);
    return () => {
      map.off("mousemove", LAYER_ID, onMove);
      map.off("mouseleave", LAYER_ID, onLeave);
      map.off("click", LAYER_ID, onSelect);
      map.off("click", onDismiss);
      setHoveredFeature(null);
      setSelectedFeature(null);    // leaving census clears the pin (the panel gates on census)
    };
  }, [map, view]);

  // Reflect the pinned business as a RING on the map (the selection layer's filter → its
  // objectid), so the reader keeps track of which dot the InfoRail describes.
  useEffect(() => {
    if (!map) return;
    try {
      if (!map.getLayer(SELECT_LAYER_ID)) return;
      const id = selectedFeature?.objectid;
      map.setFilter(SELECT_LAYER_ID,
        id != null ? ["==", ["get", "objectid"], id] : ["==", ["get", "objectid"], -1]);
    } catch { /* map tearing down */ }
  }, [map, selectedFeature, layers]);

  // ── VIEW 2 · cluster source + layers lifecycle ─────────────────────────────
  // On the clusters view (once the joined source is ready) add the cluster source + its two
  // layers (faint UNDER prominent), appended last so they sit above the basemap + overlays
  // (§1.3). Removed on leaving. RECREATE, never setData (BP mode-B): add/remove the source.
  useEffect(() => {
    if (!map) return;
    try {
      const present = !!map.getSource(CLUSTER_SRC);
      if (view === "clusters" && clusterFC) {
        if (!present) {
          map.addSource(CLUSTER_SRC, { type: "geojson", data: clusterFC });
          if (GLOW_ENABLED) map.addLayer(clusterGlowLayer());   // §3 experimental accent (below faint + prominent)
          map.addLayer(clusterFaintLayer());
          map.addLayer(clusterProminentLayer());
        }
      } else if (present) {
        if (map.getLayer(CLUSTER_PROM_ID)) map.removeLayer(CLUSTER_PROM_ID);
        if (map.getLayer(CLUSTER_FAINT_ID)) map.removeLayer(CLUSTER_FAINT_ID);
        if (map.getLayer(CLUSTER_GLOW_ID)) map.removeLayer(CLUSTER_GLOW_ID);
        map.removeSource(CLUSTER_SRC);
      }
    } catch { /* map tearing down */ }
  }, [map, view, clusterFC]);

  // ── VIEW 2 · light the selected trades (spec §2.2/§2.3) ────────────────────
  // Prominent = SIGNIFICANT members of the selection; faint = NON-significant of the SAME
  // trade (single-select only — dropped on multi-select, G2). Empty selection → both filters
  // match nothing → blank map (spec §2.1).
  useEffect(() => {
    if (!map || view !== "clusters") return;
    try {
      if (!map.getLayer(CLUSTER_PROM_ID)) return;
      const multi = selectedTrades.length > 1;
      // Each selected trade gets its own GTA-bright hue (§1) — single-select = blue, multi-select a
      // distinct vivid hue per trade (the comparison read). Colour + filter both per selection.
      map.setFilter(CLUSTER_PROM_ID, clusterFilter(selectedTrades, "sig"));
      map.setPaintProperty(CLUSTER_PROM_ID, "circle-color", sigColour(selectedTrades));
      map.setFilter(CLUSTER_FAINT_ID, multi ? clusterFilter([], "nonsig") : clusterFilter(selectedTrades, "nonsig"));
      map.setPaintProperty(CLUSTER_FAINT_ID, "circle-color", faintColour(selectedTrades));
      // §2 faint fix — opacity scales INVERSELY with the selected trade's non-significant VOLUME
      // (single-select only; faint is dropped on multi), so a big trade (Lessors) never drowns its
      // significant cluster in a wall of colour.
      if (!multi && selectedTrades.length === 1 && lclqRows) {
        const d = tradeDetail(lclqRows, selectedTrades[0]);
        map.setPaintProperty(CLUSTER_FAINT_ID, "circle-opacity", faintOpacityForVolume(d ? d.n - d.sig : 0));
      }
      // §3 experimental glow accent — same significant filter + trade hue as the dots it enhances.
      if (GLOW_ENABLED && map.getLayer(CLUSTER_GLOW_ID)) {
        map.setFilter(CLUSTER_GLOW_ID, clusterFilter(selectedTrades, "sig"));
        map.setPaintProperty(CLUSTER_GLOW_ID, "circle-color", sigColour(selectedTrades));
      }
    } catch { /* map tearing down */ }
  }, [map, view, selectedTrades, clusterFC, lclqRows]);

  // ── VIEW 2 · hover a lit cluster point → InfoRail preview (its trade + strength). No pin,
  // no ring here — stats live in the panel (spec §2.4); the InfoRail is a light hover readout.
  useEffect(() => {
    if (!map || view !== "clusters") return undefined;
    let lastId = null;
    function onMove(e) {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties;
      if (props.objectid === lastId) return;
      lastId = props.objectid;
      setHoveredFeature(props);
    }
    function onLeave() {
      map.getCanvas().style.cursor = "";
      lastId = null;
      setHoveredFeature(null);
    }
    for (const id of [CLUSTER_PROM_ID, CLUSTER_FAINT_ID]) {
      map.on("mousemove", id, onMove);
      map.on("mouseleave", id, onLeave);
    }
    return () => {
      for (const id of [CLUSTER_PROM_ID, CLUSTER_FAINT_ID]) {
        map.off("mousemove", id, onMove);
        map.off("mouseleave", id, onLeave);
      }
      setHoveredFeature(null);
    };
  }, [map, view, clusterFC]);

  return (
    <article className="content-map pa-map">
      <div className="pa-canvas">
        <div className="canvas-wrap">
          {fetchError ? (
            <EmptyState title="Could not load data"
              body="The business census data failed to load. Try refreshing the page." />
          ) : (
            <>
              {!layers && <MapSkeleton />}
              {layers && (
                <MapErrorBoundary>
                  <MapView
                    className="canvas"
                    basemapStyle={BASEMAP_STYLE}
                    geojsonUrl={POINTS_URL}
                    view={MAP_VIEW}
                    sourceId={SOURCE_ID}
                    layers={layers}
                    onLoad={handleMapLoad}
                    cooperativeGestures={false}
                    mapAttribution={siteConfig.bcMapAttribution}
                  />
                </MapErrorBoundary>
              )}
            </>
          )}
        </div>

        {/* INFORAIL — the fixed right detail panel (census view). Hover PREVIEWS a business
            here (hover wins); on exit it reverts to the pinned one; click pins the full labelled
            hierarchy and rings the dot on the map. The ✕ shows only for a real pin (a preview is
            not dismissible — moving to the panel ends the hover and reverts it). */}
        {((view === "census") || (view === "clusters" && hoveredFeature)) && layers && (
          <BusinessCensusInfoRail
            selected={hoveredFeature ?? selectedFeature}
            pinned={view === "census" && hoveredFeature == null && selectedFeature != null}
            onClear={() => setSelectedFeature(null)}
          />
        )}

        {/* INSTRUMENT COLUMN — view switcher (persistent) → identity + banner →
            per-view content. The switcher is user-selected; zoom never changes it. */}
        <div className="pa-float pa-column pa-column-lean">
          {/* TITLE CARD — "Business Census" only (PA pattern: the title/city card is SEPARATE
              from the selector below). Structurally ready for a city switcher (PA has an
              Edmonton/Calgary toggle here); BC is Edmonton-only for now, so none is built/shown. */}
          <section className="pa-card pa-card-identity">
            <IdentityCard title="Business Census" />
          </section>

          {/* VIEW SELECTOR CARD — the three views, its OWN card below the title (PA keeps the
              metric selector in a separate card from the title). */}
          <section className="pa-card">
            <div className="bc-view-switch">
              <SegmentedControl label="View" options={VIEWS} value={view} onChange={changeView} />
            </div>
          </section>

          {/* The "This view is …" epistemic-status chip was REMOVED entirely (KC 2026-07-24).
              Each view's `status` metadata (spec Part 0) is retained on VIEWS but no longer
              rendered here. */}

          {/* ── VIEW 1 · Business Census — sector legend + the tunable character
               surface + count ── */}
          {view === "census" && domain && (
            <section className="pa-card pa-card-instrument">
              <div className="pa-col-mod pa-col-legend">
                {aggregates && (
                  <BusinessCensusLegend
                    aggregates={aggregates}
                    selectedSector={selectedSector}
                    hoveredSector={hoveredSector}
                    onSelectSector={selectSector}
                    onHoverSector={setHoveredSector}
                  />
                )}
              </div>

              {/* Character Surface sliders + District/Neighbourhood toggles REMOVED (KC):
                  settled values are hardcoded (KDE 250 m / 200 m / 60 %; districts +
                  neighbourhoods permanently ON). The composition console moved to the bottom
                  dock (.pa-foot). The total-count line was REMOVED too (KC 2026-07-24): the
                  legend's label frame now shows the total at rest, so a second count line was
                  redundant (DESIGN_SYSTEM §3). The sidebar is now the wheel + its frame alone. */}
            </section>
          )}

          {/* ── VIEW 2 · Industry Clusters — the choosable list IS the finding
               (spec §2.1), ranked by SHARE SIGNIFICANT. This turn the list is the
               finding, shown read-only; selection-lighting + the statistics panel
               are the next step (they hinge on two decisions in the CC report:
               the evidence-strength basis and whether to curate Lessors). ── */}
          {view === "clusters" && (
            <section className="pa-card pa-card-instrument">
              <div className="pa-col-mod">
                <span className="pa-col-lab">Trades That Cluster</span>
                <p className="bc-ref-note">
                  Ranked by the share of each trade that sits in a statistically real
                  cluster — “which trades cluster,” not which are biggest. Pick up to{" "}
                  {CLUSTER_MAX_SELECT} to light their clusters on the map.
                </p>
                {!trades ? (
                  <p className="bc-ref-note">Loading the finding…</p>
                ) : (
                  <ol className="bc-trade-list">
                    {trades.slice(0, 15).map((t) => {
                      const sel = selectedTrades.indexOf(t.group);
                      const isSel = sel >= 0;
                      const atCap = !isSel && selectedTrades.length >= CLUSTER_MAX_SELECT;
                      return (
                        <li key={t.group}>
                          <button
                            type="button"
                            className={`bc-trade-btn${isSel ? " is-selected" : ""}`}
                            aria-pressed={isSel}
                            disabled={atCap}
                            onClick={() => toggleTrade(t.group)}
                          >
                            <span className="bc-trade-share">{Math.round(t.share * 100)}%</span>
                            <span className="bc-trade-name">
                              {isSel && (
                                <span className="bc-trade-swatch"
                                  style={{ background: paletteSig(sel) }} aria-hidden="true" />
                              )}
                              {titleCase(t.group)}
                            </span>
                            <span className="bc-trade-strength">{lclqMultiplierPhrase(t.maxLclq)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <p className="bc-ref-note bc-ref-counterfactual">
                  Compared to a city where trades were shuffled at random.
                </p>

                {/* STATISTICS PANEL (spec §2.4) — per selected trade: count + share in a
                    cluster, strength as prose (no p-value, never "LCLQ"), and where it
                    concentrates. All derived from the committed estimator output. */}
                {selectedTrades.length > 0 && lclqRows && (
                  <div className="bc-cluster-stats">
                    {selectedTrades.map((g, i) => {
                      const d = tradeDetail(lclqRows, g);
                      if (!d) return null;
                      return (
                        <div key={g} className="bc-cluster-stat">
                          <div className="bc-cluster-stat-head">
                            <span className="bc-trade-swatch"
                              style={{ background: paletteSig(i) }} aria-hidden="true" />
                            <span className="bc-cluster-stat-name">{titleCase(g)}</span>
                          </div>
                          <p className="bc-cluster-stat-line">
                            <strong>{d.sig}</strong> of {d.n} sit in a cluster
                            {" "}({Math.round(d.share * 100)}%) — {clusterStrengthPhrase(d.maxLclq)}.
                          </p>
                          {d.topNeighbourhoods.length > 0 && (
                            <p className="bc-cluster-stat-nbhd">
                              Concentrated in{" "}
                              {d.topNeighbourhoods.map((nb) => titleCase(nb.name)).join(", ")}.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── VIEW 3 · Business Groupings — placeholder (spec Part 3). Do NOT
               invent groupings: the semantic crossmap is KC's unauthored editorial
               work. Banner + a short statement only. ── */}
          {view === "groupings" && (
            <section className="pa-card pa-card-instrument">
              <div className="pa-col-mod">
                <span className="pa-col-lab">Editorial Groupings</span>
                <p className="bc-ref-note">
                  A researcher-defined lens that regroups NAICS industry groups into
                  plain-English families, so clustering is simply <em>visible</em>.
                </p>
                <p className="bc-ref-note bc-ref-pending">
                  The groupings are pending — the semantic crossmap is authored and
                  ratified separately, then joined. Nothing is shown until it exists.
                </p>
              </div>
            </section>
          )}
        </div>

        {/* BOTTOM DATA CONSOLE — the composition drill-down, moved out of the sidebar into a
            PA-style pull-up dock (.pa-foot). Census view only; coexists with the InfoRail. */}
        {view === "census" && aggregates && (
          <div className="pa-foot">
            <BusinessCensusConsole
              aggregates={aggregates}
              selectedSector={selectedSector}
              selectedGroup={selectedGroup}
              hoveredSector={hoveredSector}
              open={consoleOpen}
              onToggle={() => setConsoleOpen((o) => !o)}
              onSelectSector={selectSector}
              onBack={clearSelection}
              onSelectGroup={selectGroup}
              onHoverSector={setHoveredSector}
            />
          </div>
        )}
      </div>
    </article>
  );
}
