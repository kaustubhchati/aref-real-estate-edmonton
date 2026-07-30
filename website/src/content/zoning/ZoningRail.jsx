// =============================================================================
// ZoningRail.jsx — the two-stage right rail (pass 12 §3). ABSENT AT REST:
// nothing renders until the cursor touches a zone.
//
//   STAGE 1 (hover) — three elements only: family swatch, family name,
//     neighbourhood. "Where am I and what is this" — neighbourhood answers
//     half of it, so it is deliberately NOT deferred to stage 2. Follows the
//     hovered zone, never pins, gone when the cursor leaves.
//   STAGE 2 (selected) — on click the card expands IN PLACE and pins. The
//     HEADER BLOCK (swatch · family name · neighbourhood) is the same markup
//     as stage 1 — the close ✕ overlays absolutely, so the header never
//     shifts — and the card grows DOWNWARD from a fixed top edge. Below,
//     hairline-separated: the ZONE CODE large and in mono (the one string a
//     homeowner quotes to a builder or types into the bylaw — everything
//     else is context for it) with the description beneath; Sub-area only
//     when dc2_sub_area is populated (absent, not empty — 376 of 11,518
//     zones carry it); Zone area + family share as label-value rows; the
//     permalink copy control.
//
// Click reaches stage 2 directly — no hover prerequisite (touch/keyboard).
// Dismissal is three-way (✕ here; Escape + click-outside in ZoningZonesMap).
// Hover while pinned never replaces the card (pass 11 §2 — the selection
// owns the rail until cleared). No third stage.
// =============================================================================

import { useEffect, useState } from "react";

// Zone area, honest units: m² below a hectare, hectares below a km², else km².
function formatArea(m2) {
  if (m2 == null) return "—";
  if (m2 < 10000) return `${Math.round(m2).toLocaleString()} m²`;
  if (m2 < 1e6) return `${(m2 / 10000).toFixed(m2 < 100000 ? 2 : 1)} ha`;
  return `${(m2 / 1e6).toFixed(2)} km²`;
}

// The header block — byte-identical markup in both stages; only the ✕
// (absolutely positioned, stage 2 only) is added, so expansion never moves it.
function RailHeader({ colour, family, neighbourhood, onClose }) {
  return (
    <header className="zn-rail-head">
      <span className="zn-rail-sw" style={{ background: colour }} aria-hidden="true" />
      <div className="zn-rail-idtxt">
        <span className="zn-rail-family">{family}</span>
        <span className="zn-rail-nbhd">{neighbourhood ?? "—"}</span>
      </div>
      {onClose && (
        <button type="button" className="pa-detail-clear zn-rail-close" onClick={onClose}
                aria-label="Clear selection" title="Clear selection">✕</button>
      )}
    </header>
  );
}

export default function ZoningRail({ hovered, selected, domainByKey, onClear }) {
  const stage2 = selected != null;
  const detail = stage2 ? selected.props : hovered;
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCopied(false); }, [selected?.id]);   // fresh pin → fresh control
  if (!detail) return null;   // ABSENT AT REST — after the hooks (rules of hooks)

  const family = detail.zone_family ?? "—";
  const item = domainByKey?.[family];

  function copyLink() {
    try {
      navigator.clipboard?.writeText(window.location.href)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); })
        .catch(() => { /* denied — the control quietly stays */ });
    } catch { /* clipboard unavailable */ }
  }

  return (
    <aside className={`pa-detail zn-rail${stage2 ? " is-open" : ""}`}
           aria-live="polite" aria-label={stage2 ? "Selected zone" : "Hovered zone"}>
      <RailHeader colour={item?.colour ?? "#c9c2b2"} family={family}
                  neighbourhood={detail.neighbourhood} onClose={stage2 ? onClear : null} />
      {stage2 && (
        <>
          <div className="zn-rail-mod">
            <span className="zn-rail-code">{detail.zoning}</span>
            {detail.description && <p className="zn-rail-desc">{detail.description}</p>}
          </div>
          <div className="zn-rail-mod">
            {detail.dc2_sub_area != null && detail.dc2_sub_area !== "" && (
              <div className="pa-kv">
                <span className="pa-kv-k">Sub-Area</span>
                <span className="pa-kv-v">{detail.dc2_sub_area}</span>
              </div>
            )}
            <div className="pa-kv">
              <span className="pa-kv-k">Zone Area</span>
              <span className="pa-kv-v">{formatArea(detail.area_m2)}</span>
            </div>
            {item?.shareDisplay != null && (
              <div className="pa-kv">
                <span className="pa-kv-k">Family Share of City</span>
                <span className="pa-kv-v">{item.shareDisplay}%</span>
              </div>
            )}
          </div>
          <div className="zn-rail-mod">
            <button type="button" className="zn-rail-copy" onClick={copyLink}>
              {copied ? "Link Copied ✓" : "Copy Link to This Zone"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
