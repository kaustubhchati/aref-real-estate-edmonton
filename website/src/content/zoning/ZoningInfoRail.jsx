// =============================================================================
// ZoningInfoRail.jsx — the zoning map's fixed right INFORAIL, on the Business
// Census rail's frame and contract (extract-by-copy, the v1.12 precedent: the
// BC component hardcodes NAICS rows, so the FRAME — `pa-detail bc-inforail`,
// the three-state idle/preview/pinned model, the labelled kv hierarchy — is
// reused exactly, with zoning content; AmenityInfoRail is the same sibling
// pattern. A props-generic extraction is the flagged future de-dup.)
//
//   • PREVIEW (hovering a zone) — the full hierarchy, no ✕ (nothing pinned).
//   • PINNED (a zone was clicked) — held until dismissed (✕, Escape, or a
//     click on empty map); the zone keeps its commitment casing on the map.
//   • IDLE — the prompt plus the dataset's currency line (the panel is
//     persistent, never blank — Principle 0).
//
// Row order (optical pass 7 §3): family swatch + name (ties rail to legend) →
// zone code + description → sub-area when populated (the Direct Control
// detail) → neighbourhood (the backend spatial join) → zone area → the
// family's share of city area as context.
// =============================================================================

// Zone area, honest units: m² below a hectare, hectares below a km², else km².
function formatArea(m2) {
  if (m2 == null) return "—";
  if (m2 < 10000) return `${Math.round(m2).toLocaleString()} m²`;
  if (m2 < 1e6) return `${(m2 / 10000).toFixed(m2 < 100000 ? 2 : 1)} ha`;
  return `${(m2 / 1e6).toFixed(2)} km²`;
}

export default function ZoningInfoRail({ detail, pinned = false, onClear, domainByKey, currency }) {
  // IDLE — the existing prompt wording, plus currency (updated date + count).
  if (!detail) {
    return (
      <div className="pa-detail bc-inforail zoning-rail pa-detail-idle" aria-label="Zoning detail" aria-live="polite">
        <p className="pa-detail-hint">Hover a zone for its reading; click to pin it.</p>
        {currency && <p className="pa-box-cite" style={{ margin: "8px 0 0" }}>{currency}</p>}
      </div>
    );
  }

  const family = detail.zone_family ?? "—";
  const item = domainByKey?.[family];

  return (
    <div className="pa-detail bc-inforail zoning-rail" aria-label="Zoning detail" aria-live="polite">
      <div className="pa-detail-head">
        {/* Family swatch + name — the rail ties visually to the legend row. */}
        <h2 className="pa-detail-name" title={family}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-block", width: 12, height: 12, borderRadius: 3,
              background: item?.colour ?? "#c9c2b2", marginRight: 8,
              boxShadow: "inset 0 0 0 1px rgba(20,16,24,0.35)",
            }}
          />
          {family}
        </h2>
        {pinned && (
          <button type="button" className="pa-detail-clear" onClick={onClear}
                  aria-label="Clear selection" title="Clear selection">✕</button>
        )}
      </div>
      {/* Zone code + description (one line when the description IS the family). */}
      <p className="pa-detail-sub">
        {detail.zoning}
        {detail.description && detail.description !== family ? ` · ${detail.description}` : ""}
      </p>

      <div className="pa-detail-condo">
        {detail.dc2_sub_area != null && detail.dc2_sub_area !== "" && (
          <div className="pa-kv">
            <span className="pa-kv-k">Sub-area</span>
            <span className="pa-kv-v">{detail.dc2_sub_area}</span>
          </div>
        )}
        <div className="pa-kv">
          <span className="pa-kv-k">Neighbourhood</span>
          <span className="pa-kv-v" title={detail.neighbourhood ?? undefined}>
            {detail.neighbourhood ?? "—"}
          </span>
        </div>
        <div className="pa-kv">
          <span className="pa-kv-k">Zone area</span>
          <span className="pa-kv-v">{formatArea(detail.area_m2)}</span>
        </div>
      </div>

      {/* Context: what the eye sees city-wide of this family. */}
      {item?.shareDisplay != null && (
        <p className="pa-detail-hint" style={{ margin: "8px 0 0" }}>
          {family} — {item.shareDisplay}% of city area
        </p>
      )}
    </div>
  );
}
