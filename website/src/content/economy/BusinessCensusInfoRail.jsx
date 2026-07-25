// =============================================================================
// BusinessCensusInfoRail.jsx
//
// The Business Census point map's fixed right INFORAIL — ONE frame (Principle 0), its
// CONTENT swaps with interaction state; the frame never moves. It owns BOTH readings — the
// on-map popup was removed (KC 2026-07-24), so hover and pin both land here:
//
//   • PREVIEW (hovering a dot) — the same labelled hierarchy, WITHOUT a ✕ (nothing is pinned
//     yet; moving to the panel ends the hover and it reverts to the pin or idle).
//   • PINNED (a dot was clicked) — the full labelled hierarchy, held until dismissed (✕ or a
//     click on empty map). The reader can move to the panel to read it while the pinned dot
//     stays RINGED on the map (the selection layer, businessCensusPointsStyle).
//   • IDLE (nothing hovered or pinned) — a quiet prompt (the panel is persistent, never blank).
//
// LABELLING (the directive's fix): the old popup showed an unlabelled title + a bare
// "NAICS 4172" — a reader could not tell which string was which level. Here the NAICS
// hierarchy is explicit: the INDUSTRY GROUP is the title, its 4-digit code is labelled
// "NAICS Industry Group", the parent SECTOR and the NEIGHBOURHOOD are labelled rows. Sector
// + industry group are Title-Cased (DESIGN_SYSTEM §2) via the shared transform.
// =============================================================================

import { titleCase } from "./titleCase.js";

export default function BusinessCensusInfoRail({ selected, pinned = false, onClear }) {
  // IDLE — the frame is present but empty (Principle 0): a quiet prompt of what it does.
  if (!selected) {
    return (
      <div className="pa-detail bc-inforail pa-detail-idle" aria-label="Business detail" aria-live="polite">
        <p className="pa-detail-hint">Hover a business for a reading; click to pin it here.</p>
      </div>
    );
  }

  const group = selected.industry_group ? titleCase(selected.industry_group) : "—";
  const sector = selected.sectors ? titleCase(selected.sectors) : "—";
  const code = selected.industry_group_code ?? null;
  const nbhd = selected.neighbourhood_name ?? "—";
  // (The old View-2 "Cluster strength" row was REMOVED, 2026-07-24: the InfoRail mounts on the
  // census view only now, whose features carry no `lclq_state`, so the branch was unreachable —
  // and it carried the retired "vs city average" baseline. View 2's strength readout lives in
  // the Data Console, phrased to the expected-baseline convention.)

  return (
    <div className="pa-detail bc-inforail" aria-label="Business detail" aria-live="polite">
      <div className="pa-detail-head">
        {/* Industry group = the specific classification (the title); clamped so a long NAICS
            name never grows the frame (Principle 0), the title= holds the full text. */}
        <h2 className="pa-detail-name" title={selected.industry_group ?? undefined}>{group}</h2>
        {pinned && (
          <button type="button" className="pa-detail-clear" onClick={onClear}
                  aria-label="Clear selection" title="Clear selection">✕</button>
        )}
      </div>
      {/* Labels the title's LEVEL + code: this is a NAICS industry group, and here is its code. */}
      <p className="pa-detail-sub">{code != null ? `NAICS Industry Group · ${code}` : "NAICS Industry Group"}</p>

      <div className="pa-detail-condo">
        <div className="pa-kv">
          <span className="pa-kv-k">Sector</span>
          <span className="pa-kv-v" title={sector}>{sector}</span>
        </div>
        <div className="pa-kv">
          <span className="pa-kv-k">Neighbourhood</span>
          <span className="pa-kv-v" title={nbhd}>{nbhd}</span>
        </div>
      </div>
    </div>
  );
}
