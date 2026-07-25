// =============================================================================
// AmenityLegend.jsx
//
// An INTERACTIVE categorical swatch legend for the amenity point layers — one swatch+label
// row per category, click to show/hide that category on the map. This is NEW work
// (directive §6): BC's point legend is the donut wheel, the shared Legend.jsx discrete
// mode is display-only, and no point map has an interactive swatch legend today. The
// nearest precedent is Legend.jsx's discrete rows (`.legend-*` chrome), reused here with
// a click-to-filter affordance added.
//
// Rows are BUTTONS (keyboard-operable, aria-pressed). A hidden category dims (chrome
// state) — the MAP hides it by a layer filter, never opacity:0 (directive §6). The swatch
// colour is the SAME assignment the map paints from (amenityPointStyle.categoryColours), so
// the legend can never drift from the map.
// =============================================================================

export default function AmenityLegend({ title, note, items, active, onToggle }) {
  return (
    <div className="pa-col-mod pa-col-legend">
      <div className="pa-col-lab">{title}</div>
      {note && <div className="pa-detail-hint" style={{ margin: "0 0 4px" }}>{note}</div>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map(({ key, label, colour }) => {
          const on = active.has(key);
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onToggle(key)}
                aria-pressed={on}
                title={on ? `Hide ${label}` : `Show ${label}`}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  background: "none", border: "none", padding: "3px 2px",
                  cursor: "pointer", textAlign: "left", color: "inherit",
                  opacity: on ? 1 : 0.4,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 12, height: 12, flexShrink: 0, borderRadius: 3,
                    background: colour,
                    // the dark point casing, mirrored as the swatch border so the swatch
                    // reads like the dot it stands for (#141018).
                    boxShadow: "0 0 0 1px #141018",
                  }}
                />
                <span style={{ fontSize: "var(--t-xs)", lineHeight: 1.25 }}>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
