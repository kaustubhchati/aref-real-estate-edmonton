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
        {stops.map((s) => {
          const formatted = format(s.v);
          // Hide the "· label" suffix when the label is just the value again
          // — the YoY stops label "-15%" duplicates the formatted "-15.0%".
          // Compare numerically so "-15%" and "-15.0%" count as equal; role
          // labels like "min"/"median" aren't numeric, so they're kept.
          const num = (t) => parseFloat(String(t).replace(/[^0-9.-]/g, ""));
          const labelIsValue =
            !Number.isNaN(num(s.label)) && num(s.label) === num(formatted);
          return (
            <li key={s.label} className="legend-row">
              <span className="legend-sw" style={{ background: s.c }} />
              <span className="legend-lab">
                {formatted}
                {!labelIsValue && <small> · {s.label}</small>}
              </span>
            </li>
          );
        })}
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

// Build the inline style for one categorical swatch. Dash-style mirrors the
// polygon's outline so the swatch reads like the polygon on the map.
function swatchStyle({ fillColor, pattern, outlineColor, outlineDash }) {
  // Dashed vs dotted border: pick by the gap-to-dash ratio in the dasharray.
  const borderStyle = outlineDash
    ? outlineDash[1] >= outlineDash[0] * 1.5
      ? "dotted"
      : "dashed"
    : "solid";

  // Glass (non-aggregated) states render as outline-only on the map now, so the
  // swatch matches: transparent fill, just the outline. No pattern fill.
  if (fillColor === "rgba(255,255,255,0.08)") {
    return {
      background: "transparent",
      border: `1.5px ${borderStyle} ${outlineColor || "rgba(0,0,0,0.2)"}`,
    };
  }

  const style = { background: fillColor };
  if (pattern === "stripes") {
    style.backgroundImage =
      "repeating-linear-gradient(45deg, rgba(60,55,42,0.55) 0 1.4px, transparent 1.4px 4px)";
  } else if (pattern === "dots") {
    style.backgroundImage =
      "radial-gradient(rgba(60,55,42,0.55) 1px, transparent 1.4px)";
    style.backgroundSize = "5px 5px";
  }
  style.border = `1px ${borderStyle} ${outlineColor || "rgba(0,0,0,0.2)"}`;
  return style;
}
