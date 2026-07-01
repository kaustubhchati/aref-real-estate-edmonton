// =============================================================================
// IdentityCard.jsx
//
// The identity card at the TOP of the floating control cluster (.pa-float) that
// overlays the full-bleed map (D1). One card, four parts in order:
//   1. Title   — "Property Assessment" (Title Case house standard) — FIXED.
//   2. City    — the existing OptionToggle, relocated here unchanged.
//   3. Year    — a READ-ONLY readout of the year, in green, tracking the LIVE
//                slider position (sliderYear ?? year) so it updates as the year
//                slider in the tuning rack is dragged. The slider is still the
//                control; this card only mirrors its current value.
//   4. Metric  — the SegmentedControl, COLLAPSED by default to a chip showing
//                the active metric; click to expand the full list, pick to
//                collapse again. Same METRICS / metric / setMetric wiring.
//
// Fixed vs dynamic (CLAUDE.md §6): the title, city chrome, metric labels and
// the card frame are FIXED; only the green year value and the active-metric
// state change. This card owns NO app state beyond the metric expand/collapse
// toggle — city / year / metric live in the page and their handlers
// (changeCity, setMetric) are passed in unchanged; this card only relocates
// the controls, it does not re-own them.
// =============================================================================

import { useState } from "react";

import OptionToggle from "../../components/OptionToggle.jsx";
import SegmentedControl from "../../components/SegmentedControl.jsx";

export default function IdentityCard({
  cities,
  city,
  onCityChange,
  year,
  sliderYear,
  metrics,
  metric,
  onMetricChange,
  hasData,
  showMetric = true,   // false when the console is up — the console carries the metric selector (D3)
}) {
  // The card's ONLY state: is the metric selector collapsed (a chip) or
  // expanded (the full SegmentedControl list)? Default collapsed.
  const [metricOpen, setMetricOpen] = useState(false);
  const activeMetric = metrics.find((m) => m.key === metric) ?? metrics[0];

  return (
    <section className="pa-id-card" aria-label="Property assessment controls">
      {/* TITLE — fixed; the section name moved here from the top bar. */}
      <h2 className="pa-id-title">Property Assessment</h2>

      {/* CITY — relocated OptionToggle, same handler. Shown even with no data so
          a user can leave a no-data (Calgary) empty state. */}
      <div className="opt-toggle-gel">
        <OptionToggle label="City" options={cities} value={city} onChange={onCityChange} />
      </div>

      {/* YEAR — read-only green readout tracking the LIVE slider position
          (sliderYear ?? year), so it updates as the rack's year slider drags.
          The one dynamic figure on an otherwise fixed card. Hidden until a
          year exists. */}
      {hasData && year != null && (
        <div className="pa-id-year">
          <span className="pa-id-cap">Year</span>
          <span className="pa-id-year-value">{sliderYear ?? year}</span>
        </div>
      )}

      {/* METRIC — collapsed chip (active metric + caret) → expanded
          SegmentedControl. Default collapsed; picking a metric collapses it
          again. Same METRICS source and setMetric handler as before. HIDDEN when
          the console is up (showMetric=false) — the console's spine header then
          carries the metric selector, so the buttons don't live in two places. */}
      {hasData && showMetric && (
        <div className="pa-id-metric">
          {metricOpen ? (
            <SegmentedControl
              label="Metric"
              options={metrics}
              value={metric}
              onChange={(key) => {
                onMetricChange(key);
                setMetricOpen(false); // pick → collapse back to the chip
              }}
            />
          ) : (
            <>
              <div className="pa-id-cap">Metric</div>
              <button
                type="button"
                className="pa-id-metric-chip"
                aria-expanded="false"
                aria-label={`Metric: ${activeMetric.label}. Activate to change.`}
                onClick={() => setMetricOpen(true)}
              >
                <span className="pa-id-metric-current">{activeMetric.label}</span>
                <span className="pa-id-metric-caret" aria-hidden="true">▾</span>
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
