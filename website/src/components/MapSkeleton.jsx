// =============================================================================
// MapSkeleton.jsx
//
// Map-shaped loading placeholder: a faint terrain-ish radial wash with a
// diagonal shimmer sweep and three pulsing dots. Shown (absolute-filling the
// canvas area) while a section's GeoJSON is still loading. Respects
// prefers-reduced-motion (shimmer animation disabled there) — styling in
// index.css.
// =============================================================================

export default function MapSkeleton() {
  return (
    <div className="map-skeleton" aria-label="Loading map">
      <div className="map-skeleton-bg" />
      <div className="map-skeleton-shimmer" />
      <div className="map-skeleton-dots">
        <span /><span /><span />
      </div>
    </div>
  );
}
