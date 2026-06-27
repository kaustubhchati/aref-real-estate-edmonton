// =============================================================================
// InfoRail.jsx
//
// The Property Assessment right-hand INFO BAR. A persistent overlay that mirrors
// the left control overlay (.sb) on the right edge of the map (see .rail in
// index.css). It REPLACES the old click-to-pin map popup: clicking a polygon
// sets `selectedId` in PropertyAssessmentMap, which projects that feature to the
// active year and hands it here; the rail renders the full neighbourhood detail.
//
// Two states, one component:
//   • selected  — `feature` is the projected (bare-named) properties for the
//                 active year → render the full detail (name, year, state badge,
//                 the POPUP_ROWS table, suppression / no-data notes).
//   • default   — `feature` is null → a short summary (count + how-to + the
//                 renamed-neighbourhood reference) so the rail is never blank.
//
// Reuse, not rebuild (per the directive): the detail rows come from the SAME
// POPUP_ROWS + STATE_STYLE contract the map already paints from (choroplethStyle.js),
// and the formatters are the shared utils/format.js ones the rest of the section
// uses — so the rail can never drift from the map, and it is the single home for
// the per-state copy that used to live in buildPopupHtml.
//
// Search lives here too (top of the rail): typing a name selects it (fly + fill),
// so "search" and "click a polygon" resolve to the SAME detail view.
// =============================================================================

import SearchInput from "../../components/SearchInput.jsx";
import { METRICS, POPUP_ROWS, STATE_STYLE } from "./choroplethStyle.js";
import { fmtNumber } from "../../utils/format.js";

// Plain-language reason shown for a non-aggregated polygon. Keyed by polygon_state;
// the single source for this copy now that the map popup is gone. (aggregated has
// no note — it shows the rows table instead.)
const STATE_NOTE = {
  suppressed_low_n:
    "Fewer than 100 properties — aggregate values suppressed to protect privacy.",
  non_residential:
    "No residential properties in this area. May include river valley, industrial zones, parks, or commercial-only land.",
  manufactured_home_community:
    "Manufactured home community. Lot sizes are not recorded for leased-land properties.",
  no_data:
    "No assessment data for this boundary. Area may be unregistered, recently annexed, or a planning placeholder.",
};

export default function InfoRail({
  feature,        // projected (bare-named) properties for the active year, or null
  year,           // active assessment year — labels the detail so numbers are in context
  metric,         // active metric key — shown as the headline of the detail table
  propCount,      // total cleaned residential properties (default-state headline)
  lastUpdated,    // manifest last_updated string (default-state footer)
  names,          // neighbourhood names for the search datalist
  onSearch,       // (name) => void — select-by-name (fly + fill the rail)
  onClear,        // () => void — clear the selection (back to the default summary)
  searchHint,     // hint text under the search box (loading / ready / error)
}) {
  return (
    <aside className="rail" aria-label="Neighbourhood detail">
      <div className="rail-inner">
        <section className="rail-section">
          <SearchInput
            label="Find a neighbourhood"
            placeholder="Search neighbourhood…"
            hint={searchHint}
            names={names}
            onSelect={onSearch}
          />
        </section>

        {/* aria-live so a screen reader announces the neighbourhood when a click
            or search changes the selection (the rail is the detail surface now). */}
        <div className="rail-body" aria-live="polite">
          {feature ? (
            <RailDetail
              feature={feature}
              year={year}
              metric={metric}
              onClear={onClear}
            />
          ) : (
            <RailSummary propCount={propCount} lastUpdated={lastUpdated} />
          )}
        </div>
      </div>
    </aside>
  );
}

// ---- Selected-neighbourhood detail -----------------------------------------
function RailDetail({ feature, year, metric, onClear }) {
  const state = feature.polygon_state;
  const meta = STATE_STYLE[state] || { label: state };

  // The metric the MAP is currently colouring by — shown as the headline so the
  // encoded value is ALWAYS visible. POPUP_ROWS doesn't include YoY, so without
  // this the YoY figure would appear nowhere when YoY is the active metric.
  // -999 is the YoY "no prior year" sentinel; map it (and null) to null so the
  // formatter renders an em-dash rather than "-999%".
  const activeMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const rawActive = feature[activeMetric.key];
  const activeVal = rawActive == null || rawActive === -999 ? null : rawActive;

  return (
    <section className="rail-detail">
      <header className="rail-detail-head">
        <div className="rail-detail-titles">
          <h2 className="rail-name">{feature.display_name}</h2>
          {feature.district && (
            <p className="rail-district">{feature.district} district</p>
          )}
        </div>
        <button
          type="button"
          className="rail-clear"
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear selection"
        >
          ✕
        </button>
      </header>

      {year != null && <p className="rail-year">{year} Assessment</p>}
      <p className={`rail-state ${state}`}>{meta.label}</p>

      {state === "aggregated" ? (
        <dl className="rail-rows">
          {/* Active (colour-encoded) metric first, then the rest of the contract
              minus a duplicate of it. */}
          <div className="rail-row headline">
            <dt className="rail-k">{activeMetric.label}</dt>
            <dd className="rail-v">{activeMetric.fmt(activeVal)}</dd>
          </div>
          {POPUP_ROWS.filter(([key]) => key !== activeMetric.key).map(([key, label, fmt]) => (
            <div key={key} className="rail-row">
              <dt className="rail-k">{label}</dt>
              <dd className="rail-v">{fmt(feature[key])}</dd>
            </div>
          ))}
        </dl>
      ) : state === "suppressed_low_n" ? (
        <>
          <dl className="rail-rows">
            <div className="rail-row">
              <dt className="rail-k">N properties</dt>
              <dd className="rail-v">{fmtNumber(feature.n_properties)}</dd>
            </div>
            <div className="rail-row">
              <dt className="rail-k">Median assessed</dt>
              <dd className="rail-v rail-v-muted">suppressed</dd>
            </div>
          </dl>
          <p className="rail-note">{STATE_NOTE.suppressed_low_n}</p>
        </>
      ) : (
        <p className="rail-note">{STATE_NOTE[state] ?? ""}</p>
      )}
    </section>
  );
}

// ---- Default summary (nothing selected) ------------------------------------
function RailSummary({ propCount, lastUpdated }) {
  return (
    <section className="rail-summary">
      <h2 className="rail-summary-title">Neighbourhood detail</h2>
      <p className="rail-summary-lead">
        <strong>{propCount.toLocaleString()}</strong> Layer 1a-cleaned residential
        properties across Edmonton neighbourhoods.
      </p>
      <p className="rail-summary-hint">
        Click any neighbourhood on the map — or search above — to see its full
        assessment detail here. Detail follows the year and metric you choose.
      </p>

      <div className="rail-ref">
        <p>Data last updated: {lastUpdated ?? "—"}</p>
        {/* Identity-reconciliation note: the pipeline absorbs old neighbourhood
            identities into their current one and shows the current name in every
            year, so a user reading a neighbourhood's history under a new name (or
            a suppressed 2024 value) has a plain-language explanation + the source. */}
        <p>
          Some neighbourhoods have been renamed or renumbered by the City of
          Edmonton. Their full history is shown under the current name. For
          example, Oliver was renamed Wîhkwêntôwin, effective 1 January 2025;
          values before this date are shown under Wîhkwêntôwin.{" "}
          <a
            href="https://www.edmonton.ca/city_government/city_organization/naming-committee"
            target="_blank"
            rel="noopener noreferrer"
          >
            City of Edmonton Naming Committee
          </a>
          .
        </p>
      </div>
    </section>
  );
}
