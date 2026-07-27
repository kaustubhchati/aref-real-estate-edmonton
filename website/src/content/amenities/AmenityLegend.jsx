// =============================================================================
// AmenityLegend.jsx
//
// An INTERACTIVE categorical legend for the amenity point layers — one row per category, click to
// show/hide that category on the map. Two swatch modes, one behaviour:
//   • COLOUR mode (default): a hue swatch, the SAME colour the map paints the disc from — colour
//     carries the category (Playgrounds, Spray Parks, EV). The nearest precedent is Legend.jsx's
//     discrete rows, reused here with a click-to-filter affordance.
//   • GLYPH mode ("both", §1): colour AND glyph carry the category, so each row shows the category's
//     OWN hue disc + its cream glyph — mirroring the map exactly (Recreation Facilities). Every
//     category is named and shown, hue + glyph.
//
// Rows are BUTTONS (keyboard-operable, aria-pressed). A hidden category dims (chrome state) — the
// MAP hides it by a layer filter, never opacity:0 (directive §6). The swatch can never drift from
// the map because it is built from the same assignment (colour) or the same glyph the map draws.
// =============================================================================

import { assetUrl } from "../../utils/assetUrl.js";

// The swatch for one row: a glyph-disc in "both" mode (the category's OWN hue disc + its cream glyph,
// as on the map), else the category's plain hue swatch. Both carry the shared dark casing (#141018)
// so the swatch reads like the dot it stands for.
function Swatch({ item, glyphMode, glyphByCategory }) {
  if (glyphMode) {
    const glyph = glyphByCategory?.[item.key];
    return (
      <span
        aria-hidden="true"
        style={{
          width: 16, height: 16, flexShrink: 0, borderRadius: "50%",
          background: item.colour, boxShadow: "0 0 0 1px #141018",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {glyph && <img src={assetUrl(`/icons/${glyph}.png`)} alt="" style={{ width: 11, height: 11, display: "block" }} />}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: 12, height: 12, flexShrink: 0, borderRadius: 3, background: item.colour, boxShadow: "0 0 0 1px #141018" }}
    />
  );
}

export default function AmenityLegend({ title, note, items, active, onToggle, glyphMode = false, glyphByCategory }) {
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
                title={on ? `Hide ${item.label}` : `Show ${item.label}`}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  background: "none", border: "none", padding: "3px 2px",
                  cursor: "pointer", textAlign: "left", color: "inherit",
                  opacity: on ? 1 : 0.4,
                }}
              >
                <Swatch item={item} glyphMode={glyphMode} glyphByCategory={glyphByCategory} />
                <span style={{ fontSize: "var(--t-xs)", lineHeight: 1.25 }}>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
