// =============================================================================
// Toolbar.jsx
//
// The Property Assessment top toolbar (Felt zone 1) — a thin floating pill at
// top-centre of the map, always visible (it's a MAP zone, so it stays above the
// immersive site-chrome reveal). Holds:
//   • neighbourhood search (local name search → fly + select; no geocoder),
//   • a focus-mode toggle (hide the left control panel for a clean map),
//   • an export button (shell here; wired to scoped export in C4).
//
// Props:
//   names         string[]  — datalist of neighbourhood names for search
//   onSearch      (name) => void   — select-by-name (fly + fill)
//   focusMode     bool      — current focus state (for the toggle's pressed look)
//   onToggleFocus () => void
//   onExport      () => void | undefined  — undefined = disabled shell (pre-C4)
// =============================================================================

import SearchInput from "../../components/SearchInput.jsx";

// Small single-path stroke icons, matching the metric-control icon style.
const ICON_FOCUS =
  "M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M3 16v3a2 2 0 0 0 2 2h3 M16 21h3a2 2 0 0 0 2-2v-3";
const ICON_EXPORT =
  "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3";

function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function Toolbar({ names, onSearch, focusMode, onToggleFocus, onExport }) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Map tools">
      <div className="toolbar-search">
        <SearchInput
          placeholder="Search neighbourhood…"
          names={names}
          onSelect={onSearch}
        />
      </div>
      <button
        type="button"
        className={`toolbar-btn${focusMode ? " active" : ""}`}
        onClick={onToggleFocus}
        aria-pressed={focusMode}
        title={focusMode ? "Exit focus mode" : "Focus mode — hide the controls panel"}
      >
        <Icon d={ICON_FOCUS} />
        <span className="toolbar-btn-label">Focus</span>
      </button>
      <button
        type="button"
        className="toolbar-btn"
        onClick={onExport}
        disabled={!onExport}
        title={onExport ? "Export the current selection" : "Export (coming soon)"}
      >
        <Icon d={ICON_EXPORT} />
        <span className="toolbar-btn-label">Export</span>
      </button>
    </div>
  );
}
