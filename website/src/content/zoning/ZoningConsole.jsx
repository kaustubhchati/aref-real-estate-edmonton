// =============================================================================
// ZoningConsole.jsx — the zoning map's single BOTTOM data console (pass 11 §3):
// the left legend panel and the right info rail are both retired, and their two
// jobs fold into this one bottom-docked surface on the Business Census console
// pattern — the View-2 `.bc-icn` always-on frame, the `.bc-cn` cell grid, and
// PA's `.dt-tile` metric idiom (extract-by-copy, the v1.12 precedent; the
// props-generic extraction stays the flagged future de-dup). Attention moves
// vertically — map above, console below — with no side panels on the map.
//
// TWO STATES, ONE HEIGHT (the map must not resize under the cursor): both
// states are ALWAYS rendered, stacked into the same grid cell; the inactive
// one keeps its layout (visibility:hidden), so the console's height is the
// taller of the two at any viewport width — no magic pixel value to drift.
//   • REST  — the ten families as cells (swatch · name · share bar ·
//             count · share), area-descending, click-to-ISOLATE; plus the
//             prompt line. The head carries the currency (date + zone count).
//   • ACTIVE — the hover/pin reading: family swatch + name, zone code ·
//             description, Sub-area when populated, Neighbourhood, Zone area,
//             and the family's share of city area. Ends when hover ends and
//             nothing is pinned; a pin holds it (✕ / Escape / empty-map click).
//
// The console also reports its own height to the map chrome: a ResizeObserver
// writes `--zn-foot-h` onto the containing .pa-canvas, and the map's
// bottom-right controls (scale + attribution) lift above it — the scale bar
// must stay readable with an always-on dock (no overlap at any width).
// =============================================================================

import { useEffect, useRef } from "react";

// Zone area, honest units: m² below a hectare, hectares below a km², else km².
function formatArea(m2) {
  if (m2 == null) return "—";
  if (m2 < 10000) return `${Math.round(m2).toLocaleString()} m²`;
  if (m2 < 1e6) return `${(m2 / 10000).toFixed(m2 < 100000 ? 2 : 1)} ha`;
  return `${(m2 / 1e6).toFixed(2)} km²`;
}

// One metric tile (PA's .dt-tile classes — the shared console language).
function Tile({ label, value, foot }) {
  return (
    <div className="dt-tile">
      <div className="dt-tile-l">{label}</div>
      <div className="dt-tile-v">{value}</div>
      {foot && <div className="dt-tile-ft"><span className="dt-tile-foot">{foot}</span></div>}
    </div>
  );
}

export default function ZoningConsole({
  title, selectorNode, domain, domainByKey, isolated, onToggleFamily,
  detail, pinned, onClear, currency,
}) {
  const active = detail != null;
  const family = detail?.zone_family ?? "—";
  const item = domainByKey?.[family];
  const maxShare = domain.length ? Number(domain[0].share) || 1 : 1;

  // Report the console's real height to the map chrome (see header note).
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const canvas = el?.closest(".pa-canvas");
    if (!el || !canvas) return undefined;
    const ro = new ResizeObserver(() => {
      canvas.style.setProperty("--zn-foot-h", `${el.offsetHeight}px`);
    });
    ro.observe(el);
    return () => { ro.disconnect(); canvas.style.removeProperty("--zn-foot-h"); };
  }, []);

  return (
    <section ref={ref} className="bc-icn zn-cn" aria-label="Zoning data console">
      <div className="bc-icn-head">
        <h2 className="zn-cn-title">{title}</h2>
        <div className="zn-cn-headright">
          {/* View switch — injected by ZoningSection only when it has >1 view. */}
          {selectorNode}
          <span className="bc-icn-cap">{currency}</span>
        </div>
      </div>

      <div className="zn-cn-body">
        {/* REST — the family legend as a shallow cell grid, click-to-isolate. */}
        <div className={`zn-cn-state${active ? " is-off" : ""}`} aria-hidden={active}>
          <div className="bc-cn-grid zn-cn-grid">
            {domain.map((it) => (
              <button
                key={it.key} type="button"
                className={`bc-cn-cell${isolated === it.key ? " is-active" : ""}`}
                onClick={() => onToggleFamily(it.key)}
              >
                <span className="bc-cn-cellhead">
                  <span className="bc-cn-sw" style={{ background: it.colour }} aria-hidden="true" />
                  <span className="bc-cn-name">{it.label}</span>
                </span>
                <span className="bc-cn-barrow">
                  <span className="bc-cn-bar">
                    <span
                      className="bc-cn-bar-fill"
                      style={{ width: `${Math.max(2, (Number(it.share) / maxShare) * 100)}%`, background: it.colour }}
                    />
                  </span>
                  <span className="bc-cn-meta">{it.count?.toLocaleString()} · {it.shareDisplay}%</span>
                </span>
              </button>
            ))}
          </div>
          <p className="zn-cn-prompt">
            Hover a zone for its reading; click to pin it.{" "}
            {isolated ? "Click the family again to show all." : "Click a family to isolate it."}
          </p>
        </div>

        {/* ACTIVE — one horizontal reading strip: identity block, then tiles. */}
        <div className={`zn-cn-state zn-cn-active${active ? "" : " is-off"}`} aria-hidden={!active}>
          <div className="zn-cn-lead">
            <span
              className="bc-cn-sw bc-cn-headsw"
              style={{ background: item?.colour ?? "#c9c2b2" }}
              aria-hidden="true"
            />
            <div className="zn-cn-leadtxt">
              <span className="zn-cn-family">{family}</span>
              <span className="zn-cn-code">
                {detail?.zoning}
                {detail?.description && detail.description !== family ? ` · ${detail.description}` : ""}
              </span>
            </div>
            {pinned && (
              <button type="button" className="pa-detail-clear" onClick={onClear}
                      aria-label="Clear selection">✕</button>
            )}
          </div>
          <div className="zn-cn-tiles">
            {detail?.dc2_sub_area != null && detail?.dc2_sub_area !== "" && (
              <Tile label="Sub-area" value={detail.dc2_sub_area} />
            )}
            <Tile label="Neighbourhood" value={detail?.neighbourhood ?? "—"} />
            <Tile label="Zone Area" value={formatArea(detail?.area_m2)} />
            {item?.shareDisplay != null && (
              <Tile label="Share of City Area" value={`${item.shareDisplay}%`} foot={family} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
