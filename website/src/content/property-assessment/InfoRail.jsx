// =============================================================================
// InfoRail.jsx
//
// The Property Assessment right-hand INFO RAIL (Felt zone 3). Hidden by default;
// PropertyAssessmentMap renders it ONLY when exactly one neighbourhood is
// selected (single-select), and it slides in from the right edge (.rail in
// index.css). It replaced the old click-to-pin map popup.
//
// Shows the selected neighbourhood's detail for the active year: name, year,
// state badge, a value SPARKLINE of the active metric across every year (free —
// all years are on the resident combined feature), then the full row table.
//
// Reuse, not rebuild: the detail rows come from the SAME POPUP_ROWS + STATE_STYLE
// contract the map paints from (choroplethStyle.js) + the shared format.js
// formatters — so the rail can never drift from the map. It is the single home
// for the per-state copy that used to live in buildPopupHtml. (Search moved to
// the top-centre search pill; site-wide provenance lives in the left control box.)
// =============================================================================

import Sparkline from "../../components/Sparkline.jsx";
import { METRICS, POPUP_ROWS, STATE_STYLE } from "./choroplethStyle.js";
import { fmtNumber } from "../../utils/format.js";

// Plain-language reason shown for a non-aggregated polygon, keyed by polygon_state.
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
  feature,      // projected (bare-named) properties of the selected nbhd, active year
  year,         // active assessment year — labels the detail so numbers are in context
  metric,       // active metric key — headline + the sparkline series
  years,        // the manifest year list (for the sparkline caption range)
  sparkValues,  // active metric across `years` for the selected nbhd (null = gap)
  activeIndex,  // index of the active year within `years` (dots the sparkline)
  onClear,      // () => void — clear the selection
  compact = false, // analyst view: the table carries the full stat list, so the rail
                   // trims to name + sparkline + the single headline value
}) {
  const state = feature.polygon_state;
  const meta = STATE_STYLE[state] || { label: state };

  // The metric the MAP is currently colouring by — shown as the headline so the
  // encoded value is ALWAYS visible (POPUP_ROWS omits YoY). -999 is the YoY
  // "no prior year" sentinel; map it (and null) to null so the formatter renders
  // an em-dash, not "-999%".
  const activeMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const rawActive = feature[activeMetric.key];
  const activeVal = rawActive == null || rawActive === -999 ? null : rawActive;

  const yearSpan =
    years && years.length ? `${years[0]}–${years[years.length - 1]}` : "";

  return (
    // aria-live so a screen reader announces the neighbourhood when a click or
    // search changes the selection. Now an in-flow block accreted into the left
    // panel below the controls (.pa-detail), no longer a floating right rail; the
    // .rail-* content classes are unchanged.
    <div className="pa-detail" aria-label="Neighbourhood detail" aria-live="polite">
      <div className="rail-inner">
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

          {/* Value sparkline — the active metric across every year for this nbhd.
              Free: all years are on the resident combined feature. Only meaningful
              when the nbhd is aggregated (other states carry no per-year values). */}
          {state === "aggregated" && sparkValues && (
            <div className="rail-spark">
              <div className="rail-spark-cap">
                <span>{activeMetric.label}</span>
                <span className="rail-spark-years">{yearSpan}</span>
              </div>
              <Sparkline
                values={sparkValues}
                activeIndex={activeIndex}
                ariaLabel={`${activeMetric.label}, ${yearSpan}`}
              />
            </div>
          )}

          {state === "aggregated" ? (
            <dl className="rail-rows">
              {/* Active (colour-encoded) metric first, then the rest of the
                  contract minus a duplicate of it. */}
              <div className="rail-row headline">
                <dt className="rail-k">{activeMetric.label}</dt>
                <dd className="rail-v">{activeMetric.fmt(activeVal)}</dd>
              </div>
              {/* Full stat list in default view; trimmed away in analyst view,
                  where the data table carries every field for every nbhd. */}
              {!compact && POPUP_ROWS.filter(([key]) => key !== activeMetric.key).map(([key, label, fmt]) => (
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
      </div>
    </div>
  );
}
