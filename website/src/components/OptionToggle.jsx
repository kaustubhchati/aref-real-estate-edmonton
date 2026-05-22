// =============================================================================
// OptionToggle.jsx
//
// A small labeled segmented-button group. Use this whenever a section's
// sidebar needs a discrete-choice control: city switcher, year selector,
// view mode (choropleth vs heatmap), basemap variant, etc.
//
// Props:
//   label    — section header text above the buttons (rendered as the
//              same 11-px uppercase muted style used by .search-label /
//              .legend-title so all sidebar sections line up visually)
//   options  — array of values (strings or numbers). Each renders as one
//              button; the button's display text is String(value).
//   value    — the currently-selected option (must === one of options
//              for the active highlight to show)
//   onChange — (newValue) => void
//
// One button per option, no overflow handling — fine up to ~4 options
// on a 300-px sidebar. If a future section needs more, swap for a <select>
// at that callsite; don't generalise this component preemptively.
// =============================================================================

import { useId } from "react";

export default function OptionToggle({ label, options, value, onChange }) {
  const groupId = useId();
  return (
    <div className="opt-toggle" role="group" aria-labelledby={`${groupId}-label`}>
      <div id={`${groupId}-label`} className="opt-toggle-label">{label}</div>
      <div className="opt-toggle-buttons">
        {options.map((opt) => {
          const isActive = opt === value;
          return (
            <button
              key={String(opt)}
              type="button"
              className={`opt-toggle-btn${isActive ? " active" : ""}`}
              onClick={() => onChange(opt)}
              aria-pressed={isActive}
            >
              {String(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
