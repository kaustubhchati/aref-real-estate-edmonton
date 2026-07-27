// =============================================================================
// busZones.js
//
// The Bus Stops zone encoding (CC directive 2026-07-27, §2 — KC ruled "nine categories, tail
// collapsed"). GTFS `zone_id` says which regional operator serves a stop; it is what explains why
// the map extends past Edmonton. CURATION lives here on the frontend (like the glyph/identity
// configs): the operator LABELS are inferred from the zone codes and human-ratified by KC at the
// STOP, they are not published feed labels.
//
// Two views of the same field:
//   • MAP + LEGEND — the operators above a count floor are NAMED; the small tail (Spruce Grove ·
//     Airport · Beaumont) collapses to "Other regional" (the B3 top-N rule with a threshold).
//   • DETAIL RAIL — always the ACTUAL operator, even for a collapsed one (the whole point of the
//     collapse: the map answers "why past the city", the exact operator is one click away).
//
// Colour comes from QUALITATIVE_12; Edmonton keeps the bus identity blue (it is 85% of stops, and
// the density/cluster stages stay that blue), so the regional stops read as the non-blue dots.
// NOTE: after the location_type=0 filter there are ZERO blank zones (the 151 blanks were all
// non-stops), so §7.4's residual grey is moot today — a defensive grey fallback stays in the colour
// expression in case a future refresh introduces one.
// =============================================================================

import { QUALITATIVE_12, RESIDUAL_COLOUR } from "./amenityPointStyle.js";

// Full operator labels for the DETAIL RAIL — every zone code, including the collapsed tail. KC-
// ratified 2026-07-27 (inferred from the Edmonton Metropolitan Transit Services Commission codes).
export const BUS_ZONE_OPERATOR = {
  "1EDM": "Edmonton",          "2STA": "St. Albert",       "4SCT": "Strathcona County",
  "9LT":  "Leduc",             "6FST": "Fort Saskatchewan", "5SGT": "Spruce Grove",
  "1AIR": "Airport (EIA)",     "7BT":  "Beaumont",
};

// The NAMED operators (map + legend), count-descending. Codes NOT here (5SGT / 1AIR / 7BT) collapse
// to "Other regional". Colours from QUALITATIVE_12; Edmonton = the identity blue.
const NAMED = [
  { code: "1EDM", label: "Edmonton",          colour: QUALITATIVE_12[7] },  // blue — identity / majority
  { code: "2STA", label: "St. Albert",        colour: QUALITATIVE_12[1] },  // orange
  { code: "4SCT", label: "Strathcona County", colour: QUALITATIVE_12[4] },  // green
  { code: "9LT",  label: "Leduc",             colour: QUALITATIVE_12[8] },  // purple
  { code: "6FST", label: "Fort Saskatchewan", colour: QUALITATIVE_12[9] },  // magenta
];
const OTHER_COLOUR = "#0e7490";   // petrol — the collapsed regional tail
const NAMED_CODES  = new Set(NAMED.map((z) => z.code));

// The dot colour expression: match zone_id → its category colour (named → own; tail → Other; blank /
// unseen → residual grey).
export function busZoneColour() {
  const arms = [];
  for (const z of NAMED) arms.push(z.code, z.colour);
  for (const code of ["5SGT", "1AIR", "7BT"]) arms.push(code, OTHER_COLOUR);
  return ["match", ["get", "zone_id"], ...arms, RESIDUAL_COLOUR];
}

// The legend (static, the KC-ratified encoding): 5 named operators + "Other regional". No "(no zone)"
// row — there are no blank-zone stops after the filter (a curation event if a future refresh adds one).
export const BUS_ZONE_LEGEND = [
  ...NAMED.map((z) => ({ key: z.code, label: z.label, colour: z.colour })),
  { key: "other-regional", label: "Other regional", colour: OTHER_COLOUR },
];

// The operator label for a stop's zone_id (detail rail). Blank/unknown → "(no zone)".
export function busZoneOperator(zoneId) {
  const code = (zoneId ?? "").toString().trim();
  return code ? (BUS_ZONE_OPERATOR[code] ?? "Other regional") : "(no zone)";
}

export { NAMED_CODES };
