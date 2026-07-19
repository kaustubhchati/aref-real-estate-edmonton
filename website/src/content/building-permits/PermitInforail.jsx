// =============================================================================
// PermitInforail.jsx
//
// The Building Permits point-map's fixed right INFORAIL — ONE frame (Principle 0),
// its CONTENT swaps with interaction state; the frame itself never moves. Replaces the
// old floating click/hover popups so the map centre stays sacred (PA_MODE_CONTRACT §1).
// Three states, all rendering the shared `.pa-detail` chrome (+ the BP-wide `.bp-inforail`
// modifier) at the same fixed position, so the swap reads as a content change, not a move:
//
//   • SELECT (a dot was clicked) — the FULL detail. FIXED-DIMENSION (Fix 6): the fixed
//     fields (address, permit type, construction value, building type, work type) sit in
//     fixed slots, and the ONE variable-length field — Description — is confined to a
//     FIXED-HEIGHT SCROLL BOX (`.bp-detail-desc`), so a 5-word and a 200-word permit render
//     the SAME frame. No data-dictated vertical cascade. The rail is widened (`.bp-inforail`)
//     so the description reads in fewer lines. A ✕ dismisses.
//   • HOVER (cursor over a dot, nothing selected) — a LIGHT "runner": address + the one key
//     metric (construction value). Fixed slot, no ✕ (nothing pinned yet).
//   • IDLE (no hover, no selection) — a quiet hint.
//
// A SELECTION takes precedence over hover (`selected` is checked first), so moving the
// cursor away never drops the pinned detail. Formatters are the section's own (permitStyle),
// so the inforail reads a permit exactly as the map's popups once did.
// =============================================================================

// COMPACT currency in chrome (DESIGN_SYSTEM §2: chrome is compact — `$13.6M`, `$353k` — full
// precision is Export's job; PA shows compact in its detail too). Fix 6.
import { fmtCurrencyShort } from "../../utils/format.js";
import { capitalise, stripBuildingCode, stripWorkCode } from "./permitStyle.js";

export default function PermitInforail({ hovered, selected, onClear }) {
  // SELECT — the full detail (pinned), a fixed-dimension frame. The fixed fields are label/
  // value rows (compact formatter, DESIGN_SYSTEM); the Description is the fixed scroll box.
  if (selected) {
    return (
      <div className="pa-detail bp-inforail" aria-label="Permit detail" aria-live="polite">
        <div className="pa-detail-head">
          <h2 className="pa-detail-name" title={selected.address ?? undefined}>{selected.address ?? "—"}</h2>
          <button type="button" className="pa-detail-clear" onClick={onClear}
                  aria-label="Clear selection" title="Clear selection">✕</button>
        </div>
        {/* CATEGORY CHIP (Fix 2) — a colour pill in the category's own hue (residential orange /
            commercial violet), reinforcing the map + filter encoding. Fixed position/size. */}
        <div className="bp-cat-chip-row">
          <span className={`bp-cat-chip bp-cat-${selected.job_group ?? "unknown"}`}>
            {capitalise(selected.job_group ?? "")} Permit
          </span>
        </div>

        {/* FIXED fields — one line each (ellipsis + title= for the full text), so they never
            grow the frame regardless of the description's length. */}
        <div className="pa-detail-condo">
          <div className="pa-kv">
            <span className="pa-kv-k">Construction Value</span>
            <span className="pa-kv-v">{fmtCurrencyShort(selected.construction_value)}</span>
          </div>
          <div className="pa-kv">
            <span className="pa-kv-k">Building Type</span>
            <span className="pa-kv-v" title={stripBuildingCode(selected.building_type ?? "")}>{stripBuildingCode(selected.building_type ?? "")}</span>
          </div>
          <div className="pa-kv">
            <span className="pa-kv-k">Work Type</span>
            <span className="pa-kv-v" title={stripWorkCode(selected.work_type ?? "")}>{stripWorkCode(selected.work_type ?? "")}</span>
          </div>
        </div>

        {/* DESCRIPTION — the ONE variable-length field, confined to a FIXED-HEIGHT scroll box
            (Principle 0): the box is the same height for any permit; long text scrolls inside
            it, so the frame never cascades. */}
        <div className="bp-detail-desc-mod">
          <span className="pa-kv-k bp-detail-desc-lab">Description</span>
          <div className="bp-detail-desc">{stripWorkCode(selected.job_description ?? "")}</div>
        </div>
      </div>
    );
  }

  // HOVER — the light runner. Same frame + width, a modifier class for the lighter treatment;
  // no ✕ (nothing pinned to clear yet). One fixed line, so it never shifts the frame (Fix 7).
  if (hovered) {
    return (
      <div className="pa-detail bp-inforail pa-detail-runner" aria-label="Permit reading" aria-live="polite">
        <div className="pa-detail-head">
          <h2 className="pa-detail-name">{hovered.address ?? "—"}</h2>
        </div>
        <div className="pa-detail-condo">
          <div className="pa-kv">
            <span className="pa-kv-k">Construction Value</span>
            <span className="pa-kv-v">{fmtCurrencyShort(hovered.construction_value)}</span>
          </div>
        </div>
        <p className="pa-detail-sub">Click for full detail.</p>
      </div>
    );
  }

  // IDLE — the frame is present but empty (Principle 0): a quiet hint of what it does.
  return (
    <div className="pa-detail bp-inforail pa-detail-idle" aria-label="Permit detail" aria-live="polite">
      <p className="pa-detail-hint">Hover a permit for a reading; click for detail.</p>
    </div>
  );
}
