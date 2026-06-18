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
  greyTitle = null,
  greyStates = null,
}) {
  return (
    <aside className="legend">
      <h2 className="legend-title">{title}</h2>

      {/* Gradient bar — honest representation of MapLibre's
          continuous linear interpolation. Discrete swatches
          imply stepped classification which isn't what renders.
          Bar width = full legend width; ticks at each stop. */}
      <div style={{ marginBottom: 8 }}>

        {/* Continuous gradient bar */}
        <div style={{
          height: 12,
          borderRadius: 3,
          background: `linear-gradient(to right, ${
            stops.map((s) => s.c).join(", ")
          })`,
          marginBottom: 4,
        }} />

        {/* Tick labels — value + role label below each stop.
            Flex with space-between so first/last align to
            bar edges; middle stops distribute evenly. */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
        }}>
          {stops.map((s) => {
            const formatted = format(s.v);
            const num = (t) =>
              parseFloat(String(t).replace(/[^0-9.-]/g, ""));
            const labelIsValue =
              !Number.isNaN(num(s.label)) &&
              num(s.label) === num(formatted);
            return (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: s === stops[0]
                    ? "flex-start"
                    : s === stops[stops.length - 1]
                      ? "flex-end"
                      : "center",
                  maxWidth: `${100 / stops.length}%`,
                }}
              >
                <span style={{
                  fontSize: "0.68rem",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--text)",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}>
                  {formatted}
                </span>
                {!labelIsValue && (
                  <span style={{
                    fontSize: "0.60rem",
                    color: "var(--text-subtle)",
                    lineHeight: 1.2,
                  }}>
                    {s.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {greyStates?.length > 0 && (
        <>
          <div className="legend-divider">{greyTitle}</div>
          <ul className="legend-list">
            {greyStates.map((g) => (
              <li key={g.label} className="legend-row">
                <span className="legend-sw" style={swatchStyle(g)} />
                <span className="legend-lab">{g.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
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
