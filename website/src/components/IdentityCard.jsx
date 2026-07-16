// =============================================================================
// IdentityCard.jsx  (shared — the standard aggregate-map identity card)
//
// The IDENTITY card — the top of the instrument column, its OWN surface (contract
// §3.1/§4). Two parts in order:
//   1. Title  — the section name, Title Case (a `title` prop; PA passes "Property
//               Assessment", Dwelling Units passes "Dwelling Units", etc.).
//   2. City   — the OptionToggle city switcher, rendered ONLY when a `cities` list is
//               supplied. Single-city sections (Dwelling Units, Business Counts —
//               Edmonton only) pass none and get a title-only card.
//
// The METRIC selector is its own module below (Identity and Metric are distinct
// frames). This card owns NO app state — city lives in the page; onCityChange is passed
// in unchanged. It relocates the identity chrome, it does not re-own it.
// =============================================================================

import OptionToggle from "./OptionToggle.jsx";

export default function IdentityCard({ title, cities, city, onCityChange }) {
  return (
    <section className="pa-id-card" aria-label={`${title} identity`}>
      {/* TITLE — the section name. */}
      <h2 className="pa-id-title">{title}</h2>

      {/* CITY — only for multi-city sections. Shown even with no data so a user can see
          (and leave) a no-data (e.g. Calgary) empty state. */}
      {cities && cities.length > 0 && (
        <div className="opt-toggle-gel">
          <OptionToggle label="City" options={cities} value={city} onChange={onCityChange} />
        </div>
      )}
    </section>
  );
}
