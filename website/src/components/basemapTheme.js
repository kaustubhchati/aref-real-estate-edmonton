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
  green:       "#c0dcb1",  // park / grass — muted + lightened (CVD-safe vs commercial pink)
  wood:        "#aee09a",  // forest / wood (deeper)
  // ---- Land-use fills: convention hue + muted tone + value separation --------------------
  // LAND-USE CONVENTION hues (Esri / APA / planning practice), rendered as the muted 70%
  // GROUND of the 70-20-10 rule: LOW saturation for subtlety, DISTINCT VALUE (lightness) for
  // legibility — so the categories separate even when muted, and the CVD-risky green/pink pair
  // is told apart by BRIGHTNESS, not hue. Perceived-luminance ladder (lightest→darkest,
  // Y≈0.299R+0.587G+0.114B): residential 226 · parks 207 · institutional 183 · commercial 168
  // · industrial 150 — every step ≥15; green↔commercial Δ39 (Δ44 under deuteranopia → CVD-safe).
  // Saturations 14–42% (all within the 30-50% "muted ground" band; grey is definitionally low).
  landuseRes:  "#eae2cc",  // residential   → pale GOLD  (lightest; the dominant, most-background use)
  landuseComm: "#d392a6",  // commercial    → dusty PINK (retail; convention pink, darker than parks)
  landuseInd:  "#8b98a7",  // industrial    → cool GREY  (darkest; convention grey = heavy / serious)
  landuseInst: "#a2bbd7",  // institutional → mid BLUE   (schools / hospitals / civic; convention blue)
  sand:        "#f5ecd0",  // sand / beach
  wetland:     "#cfe0c8",  // wetland / marsh
  farmland:    "#e3ddc2",  // farmland / agriculture — muted khaki (the urban-fringe ground)
  aeroFill:    "#ddd8cc",  // aerodrome land — neutral grey (airport polygons)
  motCase:     "#efd151",  // motorway/trunk casing
  priFill:     "#ffe888",  // primary/secondary fill
  priCase:     "#ead27a",  // primary/secondary casing
  minorCase:   "#e8dcb8",  // minor/residential casing
  service:     "#f0e9d4",  // service / path
  rail:        "#6f6957",  // rail BASE — bold dark taupe (a built structure reads as a firm line)
  railTie:     "#f6efdd",  // rail CROSS-TIES (the white dash over the base → the railway "ladder")
  building:    "#ddd1b8",  // buildings — bolder defined tan (a built structure, not a faint wash)
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
  if (/rail_dash/.test(id))            return C.railTie; // cross-ties (before the rail base below)
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
  if (/farmland/.test(id))                 return [C.farmland, "farmland"];             // urban-fringe khaki
  // Land-use classes — each its own CONVENTION hue (see the C palette above). Specific ids
  // first; the generic `landuse` layer (cemetery / stadium) falls to green (open space).
  if (/landuse_residential/.test(id))      return [C.landuseRes,  "landuse-residential"];  // gold
  if (/landuse_commercial/.test(id))       return [C.landuseComm, "landuse-commercial"];   // pink
  if (/landuse_industrial/.test(id))       return [C.landuseInd,  "landuse-industrial"];   // grey
  if (/landuse_institutional/.test(id))    return [C.landuseInst, "landuse-institutional"];// blue
  if (/sand|beach/.test(id))               return [C.sand, "sand"];
  if (/wetland|marsh|swamp/.test(id))      return [C.wetland, "wetland"];
  if (/quarry|military|garages|extraction/.test(id)) return [C.landuseInd, "landuse-hard"]; // grey
  if (/landuse/.test(id))                  return [C.green, "landuse-open(cemetery/stadium/rec)"];
  if (/building/.test(id))                 return [C.building, "building"];
  if (/boundary|admin/.test(id))           return [C.boundary, "boundary"];
  if (/aerodrome/.test(id))                return [C.aeroFill, "aerodrome"]; // fill (before roadColour's /aero/)
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
