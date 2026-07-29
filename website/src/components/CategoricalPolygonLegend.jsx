// =============================================================================
// CategoricalPolygonLegend.jsx
//
// The GENERIC legend for a categorical polygon fill — one row per class:
// swatch + label + right-aligned count (the two-column reading of the design
// schematic's legend), click to show/hide the class on the map. Domain-driven
// and section-agnostic: rows render whatever items the caller resolved, in the
// caller's order (the polygon law orders by count descending).
//
// Swatches mirror the MAP exactly: a flat item shows its hue; a PATTERN item
// shows its pattern (CSS gradients — diagonal stripes for "hatch", a dot grid
// for "dots") on its base tone, so the legend can never drift from the fill.
// Interaction is the AmenityLegend contract: rows are buttons, aria-pressed,
// hidden classes dim here and leave the map by a layer FILTER (never opacity:0).
// =============================================================================

function swatchBackground(item) {
  if (!item.pattern) return { background: item.colour };
  const { kind, base, ink } = item.pattern;
  if (kind === "dots") {
    return {
      background: `radial-gradient(circle at 4px 4px, ${ink} 1px, transparent 1.2px) 0 0 / 8px 8px, ${base}`,
    };
  }
  return {
    background: `repeating-linear-gradient(45deg, ${base} 0 3px, ${ink} 3px 4px)`,
  };
}

// interaction — the click model the PARENT implements, used only for row hints:
//   "toggle" (default) — rows show/hide their class (the schools proof);
//   "isolate"          — a row isolates its class, the rest drop to a neutral.
export default function CategoricalPolygonLegend({ title, note, items, active, onToggle, interaction = "toggle" }) {
  return (
    <div className="pa-col-mod pa-col-legend">
      <div className="pa-col-lab">{title}</div>
      {note && <div className="pa-detail-hint" style={{ margin: "0 0 4px" }}>{note}</div>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((item) => {
          const on = active.has(item.key);
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onToggle(item.key)}
                aria-pressed={on}
                // aria-label, NOT title: a native title tooltip hovers over the
                // adjacent legend rows (optical pass 3 §5) — the note line above
                // the rows carries the sighted affordance instead.
                aria-label={interaction === "isolate"
                  ? (on && active.size === 1 ? "Show all families" : `Isolate ${item.label}`)
                  : (on ? `Hide ${item.label}` : `Show ${item.label}`)}
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
                    width: 14, height: 14, flexShrink: 0, borderRadius: 3,
                    boxShadow: "inset 0 0 0 1px rgba(61,58,52,0.35)",
                    ...swatchBackground(item),
                  }}
                />
                <span style={{ fontSize: "var(--t-xs)", lineHeight: 1.25, flex: 1 }}>{item.label}</span>
                {/* Count is what the data says; AREA SHARE is what the eye sees —
                    without it, 779 polygons filling a quarter of the screen reads
                    as a defect. Share renders when the item carries one. */}
                {item.count != null && (
                  <span style={{ fontSize: "var(--t-2xs)", opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
                    {item.count.toLocaleString()}
                    {item.share != null && ` · ${item.share >= 10 ? Math.round(item.share) : item.share.toFixed(1)}%`}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
