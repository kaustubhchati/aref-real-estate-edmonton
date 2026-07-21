// =============================================================================
// FeatureHighlights.jsx  (home dashboard-demo tiles)
//
// The three uniform, auto-looping image demos that lead the "Urban Alberta
// Dashboards" section: they show WHAT YOU CAN DO; the category cards below say
// WHICH dashboards exist. Exactly three tiles, each a real-still Ken Burns +
// cross-fade + motion-overlay loop built from the shared demo components:
//   1. Property Assessment: select an area, read the table, export   (FeatureDemo)
//   2. Scrub the year: the map recolours in sync                      (SliderDemo)
//   3. Building Permits: zoom in, heat resolves to points             (FeatureDemo)
//
// This component renders ONLY the tile grid; the section header + prose live in
// Home.jsx (the merged dashboards section owns them). Stills are self-hosted
// under /public/demo and load through assetUrl. Bounded maintenance: if a
// dashboard's chrome changes materially, re-shoot that demo's stills; the labels,
// overlays and motion do not need re-shooting.
// =============================================================================

import FeatureDemo from "../../components/FeatureDemo.jsx";
import SliderDemo from "../../components/SliderDemo.jsx";

// Tile 1: PA "select an area, read the table, export" (tight real crops + overlays).
const PA_SELECT = {
  label: "Select an area → table → export",
  blurb: "Drag a box, get the rolled-up figures and a sortable table, then export CSV / GeoJSON.",
  cycle: 9,
  stills: [
    {
      src: "/demo/pa-select-1.jpg",
      alt: "Seven central Edmonton neighbourhoods (Downtown, Riverdale, Cloverdale, McCauley and more) drag-selected with a violet outline.",
      origin: "52% 46%",
      overlays: [
        { kind: "marquee", at: { left: "23%", top: "13%", width: "56%", height: "60%" } },
        { kind: "cursor", at: { left: "74%", top: "70%" } },
      ],
    },
    {
      src: "/demo/pa-select-2.jpg",
      alt: "The results: '7 neighbourhoods selected', median $215k and mean $267k, and a sortable table.",
      origin: "34% 54%",
      overlays: [{ kind: "cursor", at: { left: "13%", top: "60%" } }],
    },
    {
      src: "/demo/pa-select-3.jpg",
      alt: "The export menu (This Year, All Years and Selection Summary CSVs plus GeoJSON) beside the Export button.",
      origin: "42% 44%",
      overlays: [
        { kind: "cursor", at: { left: "26%", top: "37%" } },
        { kind: "chip", at: { left: "41%", top: "27%" }, text: "✓ CSV" },
      ],
    },
  ],
};

// Tile 2: the year slider (left, sliding) recolours the map (right) in sync.
const SLIDER = {
  label: "Scrub the year, watch the map transform",
  blurb: "On % condominium, the new south-west (Chappelle, Rutherford) fills in from empty to condo-dense across 2012 → 2026.",
  cycle: 7.5,
  map: ["/demo/map-slider-2012.jpg", "/demo/map-slider-2026.jpg"],
  years: ["2012", "2026"],
  alt: "The % condominium choropleth: the south-west new-build belt (Chappelle, Rutherford, South Terwillegar) fills in from undeveloped in 2012 to condo-dense in 2026.",
};

// Tile 3: one continuous push-in, BP heat (city) resolving to individual permits.
const BP_ZOOM = {
  label: "Zoom in, density resolves to permits",
  blurb: "Permit heat at the city scale resolves into individual permits as you zoom into the south.",
  cycle: 8,
  kb: [1.0, 1.42, 1.95], // strong, continuous push-in (bridges the cross-fades)
  keyStill: 3, // reduced-motion frame = the resolved points
  stills: [
    { src: "/demo/bp-zoom-1.jpg", alt: "Building-permit heat across Edmonton at the city overview.", origin: "56% 60%" },
    { src: "/demo/bp-zoom-2.jpg", alt: "", origin: "54% 56%" },
    { src: "/demo/bp-zoom-3.jpg", alt: "", origin: "52% 53%" },
    { src: "/demo/bp-zoom-4.jpg", alt: "Individual building permits (orange residential, violet commercial) resolved at street level in Mill Woods.", origin: "50% 50%" },
  ],
};

// The tile grid only — the merged dashboards section (Home.jsx) supplies the header.
export default function FeatureHighlights() {
  return (
    <div className="demoband__grid">
      <FeatureDemo {...PA_SELECT} />
      <SliderDemo {...SLIDER} />
      <FeatureDemo {...BP_ZOOM} />
    </div>
  );
}
