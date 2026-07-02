// =============================================================================
// Legend.jsx
//
// Data-driven legend for a two-part choropleth: a colour ramp on top (a
// continuous gradient OR discrete class swatches), then a set of "non-ramp"
// categorical rows beneath.
//
// Both blocks are rendered from the same tables the map paints from — so the
// legend can never drift from the map (CLAUDE.md §6). The section passes:
//   • title         — heading above the ramp
//   • stops         — continuous: [{ v, c, label }]      → a vertical gradient bar
//                     discrete:   [{ from, to, c, label }] → one swatch per class
//                     (the band's colour + range), matching the map's `step` fill
//   • format        — function applied to each stop's value for the row label
//                     (gradient mode only; discrete rows use the band's own label)
//   • discrete      — true → render stops as discrete class swatches
//   • horizontal    — (PA, D6) true → a horizontal ramp bar with min/max end labels
//                     only (BC/BP omit it → the vertical quantile-tick bar)
//   • diverging     — (PA YoY, D6) true → space the horizontal stops by value (so the
//                     flat yellow plateau shows at true width) + a centre ±1% tag
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
  discrete = false,   // true → render stops as discrete class swatches, not a gradient
  horizontal = false, // (PA, D6) → a HORIZONTAL ramp bar with end labels only, instead
                      //   of the vertical quantile-tick bar (BC/BP keep the vertical form)
  diverging = false,  // (PA YoY, D6) → position the horizontal stops by VALUE so the flat
                      //   yellow plateau shows at its true width (legend = map) + a centre label
  greyTitle = null,
  greyStates = null,
}) {
  // Defensive: a section that hands us null / undefined / empty / non-array
  // stops (e.g. a metric+year combination a section couldn't build a scale for)
  // must NOT crash the page on the [...stops] spread below. Render the title
  // with a graceful note instead of throwing. (Belt-and-suspenders with the
  // section error boundary; this keeps the sidebar usable rather than caught.)
  if (!Array.isArray(stops) || stops.length === 0) {
    return (
      <aside className="legend">
        <h2 className="legend-title">{title}</h2>
        <p className="legend-empty">No colour scale for this selection.</p>
      </aside>
    );
  }

  // Horizontal ramp geometry (PA, D6) — only when `horizontal`. Sequential: an EVEN
  // min→max gradient (index-spaced). Diverging (YoY): stops spaced by VALUE, so the
  // flat yellow plateau renders at its true (narrow) width — legend = map.
  let hGradient = null, hMin, hMax;
  if (horizontal) {
    hMin = stops[0].v;
    hMax = stops[stops.length - 1].v;
    const span = (hMax - hMin) || 1;
    hGradient = `linear-gradient(to right, ${stops
      .map((s, i) => {
        const pos = diverging ? ((s.v - hMin) / span) * 100 : (i / (stops.length - 1)) * 100;
        return `${s.c} ${pos.toFixed(1)}%`;
      })
      .join(", ")})`;
  }

  return (
    <aside className="legend">
      <h2 className="legend-title">{title}</h2>

      {/* The colour scale. discrete=true → one swatch per band (exact `step`
          colours). horizontal=true (PA, D6) → a wide gradient bar with min/max
          end labels only. Otherwise (BC/BP) → a vertical gradient bar with a tick
          label per stop — vertical because a horizontal bar in a 264px sidebar
          would cram 5 quantile values into ~52px each and they collide. */}
      {discrete ? (
        <ul className="legend-list" style={{ marginBottom: 8 }}>
          {/* Most-positive band at top (mirrors the gradient's high=top). Labels
              are the band's own range string; tabular-nums aligns the digits. */}
          {[...stops].reverse().map((s) => (
            <li key={s.label} className="legend-row">
              <span
                className="legend-sw"
                style={{ background: s.c, border: "1px solid var(--border)" }}
              />
              <span
                className="legend-lab"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {s.label}
              </span>
            </li>
          ))}
        </ul>
      ) : horizontal ? (
        // HORIZONTAL ramp (PA, D6): one wide gradient bar with END labels only
        // (min → max), uniform across sequential metrics. Diverging (YoY) adds a
        // centre "±1%" tag marking the flat yellow neutral plateau, and the stops
        // are spaced by value (hGradient) so the plateau shows at its true width —
        // legend = map. Left = min / most decline, right = max / most growth.
        <div style={{ marginBottom: 8 }}>
          <div style={{
            height: 12,
            borderRadius: 4,
            background: hGradient,
            border: "1px solid var(--border)",
          }} />
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 4,
            fontSize: "0.70rem",
            fontVariantNumeric: "tabular-nums",
            color: "var(--text)",
          }}>
            <span>{format(hMin)}</span>
            {diverging && <span style={{ color: "var(--text-subtle)" }}>±1%</span>}
            <span>{format(hMax)}</span>
          </div>
        </div>
      ) : (
      <div style={{
        display: "flex",
        gap: 8,
        alignItems: "stretch",
        marginBottom: 8,
      }}>

        {/* The bar: 14px wide, 130px tall, gradient
            top=stops[last].c → bottom=stops[0].c
            (max at top, min at bottom). */}
        <div style={{
          width: 14,
          minHeight: 130,
          borderRadius: 4,
          flexShrink: 0,
          background: `linear-gradient(to bottom, ${
            [...stops].reverse().map((s) => s.c).join(", ")
          })`,
        }} />

        {/* Tick rows: space-between so they align with the
            gradient stops. First row = max (top of bar),
            last row = min (bottom of bar). Reverse stops
            so max renders at top. */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
          minHeight: 130,
        }}>
          {[...stops].reverse().map((s) => {
            const formatted = format(s.v);
            const num = (t) =>
              parseFloat(String(t).replace(/[^0-9.-]/g, ""));
            const labelIsValue =
              !Number.isNaN(num(s.label)) &&
              num(s.label) === num(formatted);
            return (
              <div key={s.label} style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}>
                {/* Short tick line connecting bar to label */}
                <div style={{
                  width: 5,
                  height: 1,
                  background: "var(--border)",
                  flexShrink: 0,
                }} />
                <div style={{ lineHeight: 1.25 }}>
                  <span style={{
                    fontSize: "0.70rem",
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--text)",
                    display: "block",
                  }}>
                    {formatted}
                  </span>
                  {!labelIsValue && (
                    <span style={{
                      fontSize: "0.60rem",
                      color: "var(--text-subtle)",
                      display: "block",
                    }}>
                      {s.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

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
