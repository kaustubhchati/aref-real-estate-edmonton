// =============================================================================
// AmenityInfoRail.jsx
//
// The amenity point map's fixed right INFORAIL — ONE frame (Principle 0), content swaps
// with interaction state, the frame never moves. Forked from BusinessCensusInfoRail
// (idle / preview / pinned; ✕ only when pinned; the .pa-detail / .pa-kv chrome), with the
// BC-specific NAICS fields replaced by a GENERIC renderer: the amenity layers each carry a
// different (but self-describing) property set, so the rail shows whatever the feature has.
//
//   • title  — the feature's name-like property (name / stop_name / facility_name / …).
//   • sub    — the category value (labelled by the category field), when the layer has one.
//   • rows   — every other property, Title-Cased key → value. Internal id fields
//              (id / *_id / objectid) are NOT shown (debris, DESIGN_SYSTEM §3/§5).
// =============================================================================

import { amenityLabel } from "./amenityPointStyle.js";

// The property used as the rail title, in preference order; else the first string value.
const TITLE_KEYS = [
  "name", "stop_name", "facility_name", "station_name",
  "official_name", "common_name", "lrt_stop_description",
];
// Never shown as a row: internal identifiers + geometry passthroughs.
const HIDDEN_KEYS = new Set(["objectid"]);
const isIdKey = (k) => k === "id" || k.endsWith("_id");

function titleField(props) {
  const byName = TITLE_KEYS.find((k) => props[k] != null && String(props[k]).length);
  if (byName) return byName;
  const firstStr = Object.keys(props).find((k) => typeof props[k] === "string" && props[k].length);
  return firstStr ?? null;
}

export default function AmenityInfoRail({ selected, pinned = false, onClear, categoryField, categoryLabel }) {
  // IDLE — present but empty (Principle 0): a quiet prompt of what it does.
  if (!selected) {
    return (
      <div className="pa-detail bc-inforail pa-detail-idle" aria-label="Amenity detail" aria-live="polite">
        <p className="pa-detail-hint">Hover a point for a reading; click to pin it here.</p>
      </div>
    );
  }

  const tField = titleField(selected);
  const title = tField ? String(selected[tField]) : "—";
  const catValue = categoryField && selected[categoryField] != null ? String(selected[categoryField]) : null;

  // Every remaining property becomes a labelled row (skip the title, the category — shown as
  // the sub-line — the internal ids, and empty values).
  const rows = Object.entries(selected).filter(([k, v]) =>
    k !== tField && k !== categoryField && !HIDDEN_KEYS.has(k) && !isIdKey(k) &&
    v != null && String(v).length,
  );

  return (
    <div className="pa-detail bc-inforail" aria-label="Amenity detail" aria-live="polite">
      <div className="pa-detail-head">
        <h2 className="pa-detail-name" title={title}>{title}</h2>
        {pinned && (
          <button type="button" className="pa-detail-clear" onClick={onClear}
                  aria-label="Clear selection" title="Clear selection">✕</button>
        )}
      </div>
      {catValue && (
        <p className="pa-detail-sub">{(categoryLabel || amenityLabel(categoryField)) + " · " + catValue}</p>
      )}

      {rows.length > 0 && (
        <div className="pa-detail-condo">
          {rows.map(([k, v]) => (
            <div className="pa-kv" key={k}>
              <span className="pa-kv-k">{amenityLabel(k)}</span>
              <span className="pa-kv-v" title={String(v)}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
