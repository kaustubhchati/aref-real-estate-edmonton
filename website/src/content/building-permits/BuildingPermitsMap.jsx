// =============================================================================
// BuildingPermitsMap.jsx
//
// The Building Permits route (nav leaf "Construction & Improvement").
//
// Step 2 scope: mount the section's own map and prove the 226,184 permit points
// render. This section is a POINT-symbol map (orange dots) loaded from a PMTiles
// vector source — fundamentally different from property-assessment's choropleth,
// so it uses its OWN mount (PermitMapView), not the shared components/MapView.jsx.
// See PermitMapView.jsx for why.
//
// Layout reuses the .content-map / .canvas-wrap CSS that property-assessment
// already defines in index.css — no new CSS yet. The sidebar (controls, legend,
// coverage note) and interactions come in later prompts; for now the map fills
// the canvas.
// =============================================================================

import PermitMapView from "./PermitMapView.jsx";

export default function BuildingPermitsMap() {
  return (
    <article className="content-map">
      <div className="canvas-wrap">
        <PermitMapView className="canvas" />
      </div>
    </article>
  );
}
