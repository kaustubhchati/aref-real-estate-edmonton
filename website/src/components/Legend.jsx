// =============================================================================
// Legend.jsx
//
// Data-driven legend for a two-part choropleth: a continuous colour ramp on
// top, then a set of "non-ramp" categorical rows beneath.
//
// Both blocks are rendered from the same tables the map paints from — so the
// legend can never drift from the map (CLAUDE.md §6). The section passes:
//   • title         — heading above the ramp
//   • stops         — [{ v, c, label }] from the section's style file
//   • format        — function applied to each stop's value for the row label
//   • greyTitle     — heading above the categorical block
//   • greyStates    — [{ label, fillColor, pattern, outlineColor, outlineDash }]
//
// Swatches recreate the polygon's appearance in CSS only — no canvas, no
// MapLibre — so a reader of this file doesn't need to know map internals.
// =============================================================================

export default function Legend({
  title,
  stops,
  format,
  greyTitle,
  greyStates,
}) {
  return (
    <aside className="legend">
      <h2 className="legend-title">{title}</h2>
      <ul className="legend-list">
        {stops.map((s) => (
          <li key={s.label} className="legend-row">
            <span className="legend-sw" style={{ background: s.c }} />
            <span className="legend-lab">
              {format(s.v)} <small>· {s.label}</small>
            </span>
          </li>
        ))}
      </ul>

      <div className="legend-divider">{greyTitle}</div>
      <ul className="legend-list">
        {greyStates.map((g) => (
          <li key={g.label} className="legend-row">
            <span className="legend-sw" style={swatchStyle(g)} />
            <span className="legend-lab">{g.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// Build the inline style for one categorical swatch. Pattern + dash-style are
// mirrored as CSS gradients / border-styles so the swatch reads identical to
// the polygon on the map.
function swatchStyle({ fillColor, pattern, outlineColor, outlineDash }) {
  const style = { background: fillColor };

  if (pattern === "stripes") {
    style.backgroundImage =
      "repeating-linear-gradient(45deg, rgba(60,55,42,0.55) 0 1.4px, transparent 1.4px 4px)";
  } else if (pattern === "dots") {
    style.backgroundImage =
      "radial-gradient(rgba(60,55,42,0.55) 1px, transparent 1.4px)";
    style.backgroundSize = "5px 5px";
  }

  // Dashed vs dotted border: pick by the gap-to-dash ratio in the dasharray.
  const borderStyle = outlineDash
    ? outlineDash[1] >= outlineDash[0] * 1.5
      ? "dotted"
      : "dashed"
    : "solid";
  style.border = `1px ${borderStyle} ${outlineColor || "rgba(0,0,0,0.2)"}`;

  return style;
}
