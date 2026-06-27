// =============================================================================
// SegmentedControl.jsx
//
// A single-select, icon+label segmented control. One option is active at a time
// (the fill encodes ONE metric, so independent switches would be wrong). Built
// fresh rather than overloading OptionToggle, which is shared with Building
// Permits and renders text-only — extending it would touch every caller.
//
// Props:
//   label    — group header (same 11px uppercase muted style as other controls)
//   options  — [{ key, label, icon? }]; `icon` is a single SVG <path d="…">
//              string (24×24 viewBox, stroke-based). Pass the section's own
//              option table (e.g. METRICS) so there are no option literals here.
//   value    — the active option's `key`
//   onChange — (key) => void
//
// a11y: a labelled radio-style group of buttons (aria-pressed marks the active
// one), mirroring OptionToggle's pattern so screen-reader behaviour is familiar.
// =============================================================================

import { useId } from "react";

export default function SegmentedControl({ label, options, value, onChange }) {
  const groupId = useId();
  return (
    <div className="seg" role="group" aria-labelledby={`${groupId}-label`}>
      <div id={`${groupId}-label`} className="seg-label">{label}</div>
      <div className="seg-options">
        {options.map((opt) => {
          const isActive = opt.key === value;
          return (
            <button
              key={opt.key}
              type="button"
              className={`seg-btn${isActive ? " active" : ""}`}
              onClick={() => onChange(opt.key)}
              aria-pressed={isActive}
            >
              {opt.icon && (
                <svg
                  className="seg-icon"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={opt.icon} />
                </svg>
              )}
              <span className="seg-text">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
