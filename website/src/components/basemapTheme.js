// =============================================================================
// basemapTheme.js
//
// "Apple Classic" warm restyle of EVERY basemap layer (the CARTO/OpenMapTiles
// base in /styles/custom-basemap.json), applied at runtime via setPaintProperty
// once the style has loaded. COLOUR + POI-HIDE ONLY:
//   • never touches the choropleth / data layers (it runs BEFORE those are added,
//     and also skips known data-layer id prefixes as a belt-and-suspenders),
//   • never changes layer order (no addLayer / moveLayer here),
//   • reversible — flip APPLY_APPLE_CLASSIC to false to restore the raw CARTO look.
//
// Called from MapView AND PermitMapView load handlers; every map section shares
// the same basemap, so this one function gives full, consistent coverage.
//
// Coverage is pattern-based on the OpenMapTiles layer-id schema, so EVERY
// fill/line/background/symbol layer gets a colour. Any layer whose id doesn't
// match a bucket falls back to the land colour and is console-logged under
// `unknown`, so a future basemap that renames layers can't silently leave a
// feature at its default CARTO colour — it shows up in the log instead.
// =============================================================================

// Master flag — the whole restyle is behind this so KC can revert in one edit.
export const APPLY_APPLE_CLASSIC = true;

// The two most eyeball-sensitive road tunables, exposed for quick tweaking.
export const ROAD_MAJOR_COLOR = "#ffe15f"; // motorway / trunk fill
export const ROAD_MINOR_COLOR = "#f3e9c4"; // minor / residential fill

// ---- Apple Classic palette --------------------------------------------------
const C = {
  land:        "#f7f1df",  // background / land
  water:       "#a9d3e8",  // water bodies + rivers
  green:       "#bde6ab",  // park / grass
  wood:        "#aee09a",  // forest / wood (deeper)
  landuseRes:  "#f4eeda",  // residential landuse
  landuseComm: "#efe9d6",  // commercial / industrial landuse
  sand:        "#f5ecd0",  // sand / beach
  wetland:     "#cfe0c8",  // wetland / marsh
  motCase:     "#efd151",  // motorway/trunk casing
  priFill:     "#ffe888",  // primary/secondary fill
  priCase:     "#ead27a",  // primary/secondary casing
  minorCase:   "#e8dcb8",  // minor/residential casing
  service:     "#f0e9d4",  // service / path
  rail:        "#c9bfa0",  // rail / transit
  building:    "#ece3ca",  // buildings
  boundary:    "#d8cfb4",  // admin boundary lines
  label:       "#6b6049",  // place / road label text
  waterLabel:  "#5a86a0",  // water label text
  halo:        "#f7f1df",  // label halo (cream)
};

// Choropleth / data layers added by the sections — never restyle these.
const DATA_LAYER = /^(nbhd|pnbhd|bcensus|permit)/;

const isPoi        = (id) => /^poi/.test(id);
const isWaterLabel = (id) => /^water(way|name)/.test(id);

// Fill colour for a road/tunnel/bridge/rail/aeroway LINE id (casing vs fill).
function roadColour(id) {
  const isCase = id.includes("_case");
  if (/mot|trunk/.test(id))            return isCase ? C.motCase   : ROAD_MAJOR_COLOR;
  if (/_pri|_sec/.test(id))            return isCase ? C.priCase   : C.priFill;
  if (/minor/.test(id))                return isCase ? C.minorCase : ROAD_MINOR_COLOR;
  if (/service|path/.test(id))         return C.service;
  if (/rail|tram|transit|subway/.test(id)) return C.rail;
  if (/aero|runway|taxiway/.test(id))  return ROAD_MINOR_COLOR; // FLAG: aeroway → minor bucket
  return null;
}

// Colour + bucket for a non-symbol, non-background, non-POI basemap layer.
// Returns [colour, bucket] or null if nothing matched (caller falls back).
// Order matters: more specific ids first (landuse_residential before landuse,
// water_shadow/water before waterway, roads last).
function colourFor(id) {
  if (/^water_shadow$|^water$/.test(id))   return [C.water, "water"];
  if (/waterway/.test(id))                 return [C.water, "water-river"];
  if (/^park|wood|forest|grass|cemeter|golf|pitch/.test(id)) return [C.green, "green"];
  if (id === "landcover")                  return [C.green, "green(landcover?)"];      // FLAG
  if (/landuse_residential/.test(id))      return [C.landuseRes, "landuse-residential"];
  if (/sand|beach/.test(id))               return [C.sand, "sand"];
  if (/wetland|marsh|swamp/.test(id))      return [C.wetland, "wetland"];
  if (/landuse/.test(id))                  return [C.landuseComm, "landuse-commercial?"]; // FLAG generic
  if (/building/.test(id))                 return [C.building, "building"];
  if (/boundary|admin/.test(id))           return [C.boundary, "boundary"];
  const r = roadColour(id);
  if (r) return [r, "road"];
  return null;
}

// Apply the theme to every basemap layer currently in the style. Returns a log
// object (also console-logged) so callers / KC can audit coverage.
export function applyAppleClassic(map) {
  if (!APPLY_APPLE_CLASSIC) return null;
  const layers = map.getStyle()?.layers ?? [];
  const log = { coloured: [], labels: [], hidden: [], unknown: [] };

  for (const layer of layers) {
    const id = layer.id;
    const t = layer.type;
    if (DATA_LAYER.test(id)) continue; // never the choropleth/data layers

    try {
      if (isPoi(id)) {
        map.setLayoutProperty(id, "visibility", "none");
        log.hidden.push(id);
        continue;
      }
      if (t === "symbol") {
        const c = isWaterLabel(id) ? C.waterLabel : C.label;
        map.setPaintProperty(id, "text-color", c);
        map.setPaintProperty(id, "text-halo-color", C.halo);
        log.labels.push([id, c]);
        continue;
      }
      if (t === "background") {
        map.setPaintProperty(id, "background-color", C.land);
        log.coloured.push([id, C.land, "land"]);
        continue;
      }
      const matched = colourFor(id);
      const [colour, bucket] = matched ?? [C.land, "UNKNOWN→land"];
      const prop = t === "fill" ? "fill-color" : t === "line" ? "line-color" : null;
      if (prop) {
        map.setPaintProperty(id, prop, colour);
        (matched ? log.coloured : log.unknown).push([id, colour, bucket]);
      }
    } catch (e) {
      console.warn("[appleClassic] could not restyle", id, e?.message);
    }
  }

  console.info("[appleClassic] coverage:", {
    coloured: log.coloured.length,
    labels: log.labels.length,
    hiddenPOI: log.hidden,
    unknownFallenBackToLand: log.unknown.map((u) => u[0]),
  });
  return log;
}
