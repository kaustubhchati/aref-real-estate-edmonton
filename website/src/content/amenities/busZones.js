// =============================================================================
// busZones.js
//
// The Bus Stops zone encoding (CC directive 2026-07-27, §2 — KC ruled "nine categories, tail
// collapsed"; cluster colouring added §D2). GTFS `zone_id` says which regional operator serves a
// stop; it is what explains why the map extends past Edmonton. CURATION lives here on the frontend:
// the operator LABELS are inferred from the zone codes and human-ratified by KC, not published feed
// labels. The backend emits a numeric `zone_idx` (curated reference bus_zone_index_<date>.csv, SAME
// order as ZONES below) so a CLUSTERED source can carry the operator through min/max accumulators.
//
// ONE table (ZONES) drives the legend, the dot colour AND the cluster colour, so they cannot
// disagree. Index into ZONES == zone_idx. Named operators above the count floor; the small tail
// (Spruce Grove · Airport · Beaumont) shares idx 5 = "Other regional". Edmonton keeps the identity
// blue (85% of stops). A cluster that SPANS two operators (zmin != zmax) renders neutral.
// =============================================================================

import { QUALITATIVE_12, RESIDUAL_COLOUR } from "./amenityPointStyle.js";

// The one table. Array index = zone_idx (backend). Legend order = this order.
export const ZONES = [
  { key: "edmonton",          label: "Edmonton",          colour: QUALITATIVE_12[7] }, // 0 — blue (identity / majority)
  { key: "st-albert",         label: "St. Albert",        colour: QUALITATIVE_12[1] }, // 1 — orange
  { key: "strathcona-county", label: "Strathcona County", colour: QUALITATIVE_12[4] }, // 2 — green
  { key: "leduc",             label: "Leduc",             colour: QUALITATIVE_12[8] }, // 3 — purple
  { key: "fort-saskatchewan", label: "Fort Saskatchewan", colour: QUALITATIVE_12[9] }, // 4 — magenta
  { key: "other-regional",    label: "Other regional",    colour: "#0e7490" },         // 5 — petrol (collapsed tail)
];
export const CLUSTER_MIXED_COLOUR = "#64748b";   // neutral slate — a cluster spanning operators

// The full per-code operator labels for the DETAIL RAIL (always the ACTUAL operator, even for the
// collapsed tail). KC-ratified 2026-07-27 (Edmonton Metropolitan Transit Services Commission codes).
export const BUS_ZONE_OPERATOR = {
  "1EDM": "Edmonton",      "2STA": "St. Albert",        "4SCT": "Strathcona County",
  "9LT":  "Leduc",         "6FST": "Fort Saskatchewan", "5SGT": "Spruce Grove",
  "1AIR": "Airport (EIA)", "7BT":  "Beaumont",
};

// The legend (from ZONES). No "(no zone)" row — 0 blank-zone stops after the location_type filter.
export const BUS_ZONE_LEGEND = ZONES;

// Individual STOP colour: match zone_idx -> ZONES colour; residual / missing -> grey.
export function busZoneColour() {
  const arms = [];
  ZONES.forEach((z, i) => arms.push(i, z.colour));
  return ["match", ["get", "zone_idx"], ...arms, RESIDUAL_COLOUR];
}

// CLUSTER disc colour (§D2, two accumulators): spans operators (zmin != zmax) -> neutral; else colour
// by the (homogeneous) operator index, built from ZONES with a loop (data-driven, §6 — no hand
// six-branch literal). Residual / unmapped falls through to grey.
export function busClusterColour() {
  const byIndex = ["case"];
  ZONES.forEach((z, i) => byIndex.push(["==", ["get", "zmin"], i], z.colour));
  byIndex.push(RESIDUAL_COLOUR);
  return ["case", ["!=", ["get", "zmin"], ["get", "zmax"]], CLUSTER_MIXED_COLOUR, byIndex];
}

// The operator label for a stop (detail rail) — blank/unknown -> "(no zone)".
export function busZoneOperator(zoneId) {
  const code = (zoneId ?? "").toString().trim();
  return code ? (BUS_ZONE_OPERATOR[code] ?? "Other regional") : "(no zone)";
}

// The label for a cluster on hover (§D2): homogeneous -> that operator; spanning -> "Mixed operators".
export function busClusterLabel(zmin, zmax) {
  if (zmin == null) return null;
  if (zmin !== zmax) return "Mixed operators";
  return ZONES[zmin]?.label ?? "Other regional";
}
