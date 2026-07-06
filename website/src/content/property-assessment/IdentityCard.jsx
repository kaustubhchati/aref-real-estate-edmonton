// =============================================================================
// IdentityCard.jsx
//
// The IDENTITY card — the top of the instrument column, its OWN surface, split
// off from the instrument chassis in P1 (contract §3.1/§4). Two parts in order:
//   1. Title  — "Property Assessment" (Title Case house standard) — FIXED.
//   2. City   — the existing OptionToggle, dark-skinned to chips in the column.
//
// The METRIC selector is its own module below (Identity and Metric are distinct
// frames), and the YEAR readout was REMOVED in P1 — it duplicated the tuning-
// module year slider's own live readout. This card owns NO app state — city
// lives in the page; changeCity is passed in unchanged. It relocates the
// identity chrome, it does not re-own it.
// =============================================================================

import OptionToggle from "../../components/OptionToggle.jsx";

export default function IdentityCard({ cities, city, onCityChange }) {
  return (
    <section className="pa-id-card" aria-label="Property assessment identity">
      {/* TITLE — fixed. */}
      <h2 className="pa-id-title">Property Assessment</h2>

      {/* CITY — relocated OptionToggle, same handler. Shown even with no data so
          a user can see (and leave) a no-data (Calgary) empty state. */}
      <div className="opt-toggle-gel">
        <OptionToggle label="City" options={cities} value={city} onChange={onCityChange} />
      </div>
    </section>
  );
}
