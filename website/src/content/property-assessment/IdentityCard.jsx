// =============================================================================
// IdentityCard.jsx
//
// The IDENTITY module at the top of the instrument column (contract §3.1/§4).
// One block, three parts in order:
//   1. Title  — "Property Assessment" (Title Case house standard) — FIXED.
//   2. City   — the existing OptionToggle, dark-skinned to chips in the column.
//   3. Year   — a READ-ONLY green readout tracking the LIVE slider position
//               (sliderYear ?? year), so it mirrors the tuning-module year slider.
//
// The METRIC selector is NO LONGER here — it is its own module below in the
// column (contract separates Identity and Metric into distinct hairline frames).
// This card owns NO app state — city / year live in the page; changeCity is
// passed in unchanged. It relocates the identity chrome, it does not re-own it.
// =============================================================================

import OptionToggle from "../../components/OptionToggle.jsx";

export default function IdentityCard({
  cities,
  city,
  onCityChange,
  year,
  sliderYear,
  hasData,
}) {
  return (
    <section className="pa-id-card" aria-label="Property assessment identity">
      {/* TITLE — fixed. */}
      <h2 className="pa-id-title">Property Assessment</h2>

      {/* CITY — relocated OptionToggle, same handler. Shown even with no data so
          a user can leave a no-data (Calgary) empty state. */}
      <div className="opt-toggle-gel">
        <OptionToggle label="City" options={cities} value={city} onChange={onCityChange} />
      </div>

      {/* YEAR — read-only green readout tracking the LIVE slider position
          (sliderYear ?? year). The one dynamic figure on an otherwise fixed
          block. Hidden until a year exists. */}
      {hasData && year != null && (
        <div className="pa-id-year">
          <span className="pa-id-cap">Year</span>
          <span className="pa-id-year-value">{sliderYear ?? year}</span>
        </div>
      )}
    </section>
  );
}
