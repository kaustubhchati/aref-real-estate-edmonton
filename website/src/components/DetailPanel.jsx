// =============================================================================
// DetailPanel.jsx  (shared single-select detail float)
//
// The right-side detail instrument shown when exactly one neighbourhood is selected
// (the map's View-mode detail). It REUSES Property Assessment's .pa-detail chrome
// (head + name + clear ✕ · sub line · notes · stat stack) so every section's detail
// reads as one system. It is deliberately LEAN vs PA's InfoRail — no sparkline, no
// value/city/delta triplet, no condo block — because the simpler sections (Dwelling
// Units, Business Counts) lack the timeseries + aggregate PA's InfoRail feeds on. PA
// keeps its richer InfoRail; this is the config-driven detail for the rest.
//
// Props (all plain data — the caller derives them from the selected feature):
//   name    — neighbourhood name (heading)
//   sub     — a small line under the name (e.g. "Northeast district") | null
//   notes   — array of §6/state notes (annexation, suppression, no-data); each a line
//   rows    — [{ k, v }] the label/value stat rows (active metric, permit count, status)
//   onClear — () => void, clears the selection (the ✕)
// =============================================================================

export default function DetailPanel({ name, sub, notes = [], rows = [], onClear }) {
  return (
    <div className="pa-detail" aria-label="Neighbourhood detail" aria-live="polite">
      <div className="pa-detail-head">
        <h2 className="pa-detail-name">{name}</h2>
        <button type="button" className="pa-detail-clear" onClick={onClear}
                aria-label="Clear selection" title="Clear selection">✕</button>
      </div>
      {sub && <p className="pa-detail-sub">{sub}</p>}
      {notes.map((n, i) => (
        <p className="pa-detail-note" key={i}>{n}</p>
      ))}
      {rows.length > 0 && (
        <div className="pa-detail-condo">
          {rows.map((r, i) => (
            <div className="pa-kv" key={i}>
              <span className="pa-kv-k">{r.k}</span>
              <span className="pa-kv-v">{r.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
