// =============================================================================
// AmenitySection.jsx
//
// A CONSOLIDATED amenity section: several related amenity maps ("views") behind ONE
// exclusive selector — the Public Transportation / Parks & Recreation pattern (CC directive
// 2026-07-27). Forked from Property Assessment's metric selector (PA_MODE_CONTRACT §4):
//   • ONE `view` string of state — EXCLUSIVE (a key, not a set); seeded from the URL.
//   • the shared <SegmentedControl> picks the view; its options come from this section's VIEWS
//     table (one source of truth, the METRICS analogue) — no option literals in the control.
//   • the selection mirrors to the URL as ?view= (DEVIATION-ONLY, replace:true — the PA rule),
//     so a specific view stays linkable / bookmarkable.
//
// WHERE IT DIFFERS FROM PA (the one honest deviation, surfaced at STOP A): PA is a single map
// that PAINT-SWAPS between metrics. An amenity view can be a genuinely different map TYPE
// (a clustered density map vs. a network map), so the section MOUNTS the active view's own
// component rather than repainting one map. Everything else is the PA pattern: one control,
// one state, one URL param. A "view" may compose MORE THAN ONE map layer when the layers are
// parts of one subject (LRT = route lines + station nodes → one view, one legend).
//
// The active view component renders the map + its console column; the section injects the
// shared selector (selectorNode) as the top module of that column and overrides the column
// title to the SECTION name, so the console reads: section title → view switch → view legend.
// =============================================================================

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import EmptyState from "../../components/EmptyState.jsx";
import SegmentedControl from "../../components/SegmentedControl.jsx";
import AmenityDensityMap from "./AmenityDensityMap.jsx";
import AmenityNetworkMap from "./AmenityNetworkMap.jsx";
import AmenityPointMap from "./AmenityPointMap.jsx";
import { GLYPH_CONFIG } from "./amenityGlyphs.js";

// The section catalogue. Each section = a title + an ordered VIEWS table. A view row carries the
// SegmentedControl fields (key/label — text-only, no icon by decision: the labels are
// self-explanatory and PA's re-homed chips are text-only too) PLUS how to render it (component +
// the manifest layerId, and idField where the map promotes a non-default id). The FIRST view is
// the DEFAULT (a bare URL). Adding a view = one row here; adding a section = one entry + one
// route in main.jsx.
const SECTIONS = {
  "public-transportation": {
    title: "Public Transportation",
    views: [
      { key: "bus-stops",   label: "Bus Stops",   component: AmenityDensityMap, layerId: "bus_stops" },
      { key: "lrt-network", label: "LRT Network", component: AmenityNetworkMap, layerId: "lrt_stops", idField: "lrt_stop_number" },
    ],
  },
  // Parks & Recreation — four unrelated inventories, four category axes, so the exclusive switch is
  // straightforwardly right (one at a time — directive §4). All four are the generic point map.
  // Named to accommodate the Parks POLYGON layer (1,195 feat) joining when Family 3 lands — do not
  // narrow the name.
  "parks-and-recreation": {
    title: "Parks and Recreation",
    views: [
      { key: "playgrounds",           label: "Playgrounds",           component: AmenityPointMap, layerId: "playgrounds" },
      { key: "spray-parks",           label: "Spray Parks",           component: AmenityPointMap, layerId: "spray_parks" },
      { key: "recreation-facilities", label: "Recreation Facilities", component: AmenityPointMap, layerId: "recreation_facilities" },
      { key: "track-sports-fields",   label: "Track Sports Fields",   component: AmenityPointMap, layerId: "track_sports_fields" },
    ],
  },
};

export default function AmenitySection({ sectionKey }) {
  const section = SECTIONS[sectionKey];
  const views = section?.views ?? [];

  const [searchParams, setSearchParams] = useSearchParams();
  // Seed the active view from ?view= (validated against THIS section's table), else the first
  // view (the default → a bare URL). Synchronous, exactly like PA's metric seed.
  const [view, setView] = useState(() => {
    const q = searchParams.get("view");
    return views.some((v) => v.key === q) ? q : views[0]?.key;
  });

  // Mirror the view to the URL — DEVIATION ONLY (the default view → bare path), replace:true so a
  // switch updates the link without history spam. Exactly PA's control-mirror rule (camera is not
  // in the URL — only the control).
  useEffect(() => {
    const params = {};
    if (view && view !== views[0]?.key) params.view = view;
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- write on view change; views is section-const
  }, [view]);

  // Unknown sectionKey — route-driven, so this should never render; a visible message beats a blank.
  if (!section) {
    return <EmptyState title="Section not found" body="This amenity section is not configured." />;
  }

  const active = views.find((v) => v.key === view) ?? views[0];
  const View = active.component;

  // Each chip carries its layer's IDENTITY HUE as a dot (DESIGN_SYSTEM §1 — the switch says which
  // layer, since with the exclusive selector only one is on screen). Read from the one source, the
  // glyph/identity config, so a chip can never drift from the map's disc colour.
  const swatches = Object.fromEntries(
    views.map((v) => [v.key, GLYPH_CONFIG[v.layerId]?.identityHue]).filter(([, c]) => c),
  );
  // The shared selector — driven by the VIEWS table, writing the single `view` state. Reuses the
  // metric-module column styling (.pa-col-metric) in the view's column.
  const selectorNode = (
    <SegmentedControl label="View" options={views} value={view} onChange={setView} swatches={swatches} />
  );

  // key={active.key} → each view is a FRESH mount (its own map, camera, fetch, selection) — the
  // honest model when views are different map types, and clean swaps for same-component views
  // (Parks). The section injects the selector + the section title into the view's console column.
  return (
    <View
      key={active.key}
      layerId={active.layerId}
      idField={active.idField}
      title={section.title}
      selectorNode={selectorNode}
    />
  );
}
