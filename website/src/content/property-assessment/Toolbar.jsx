// =============================================================================
// Toolbar.jsx
//
// The Property Assessment top toolbar — a thin floating pill at top-centre of the
// map. Holds the neighbourhood search (local name search → fly + select; no
// geocoder) and an export menu (CSV / GeoJSON / PNG of the current selection, or
// all when none is selected).
//
// Props:
//   names    string[]  — names for the search dropdown
//   onSearch (name) => void   — select-by-name (fly + fill)
//   onExport (format) => void — "csv" | "geojson" | "png"
// =============================================================================

import { useEffect, useRef, useState } from "react";
import SearchInput from "../../components/SearchInput.jsx";

// Single-path stroke icon, matching the metric-control icon style.
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

export default function Toolbar({ names, onSearch, onExport }) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);
  const triggerRef = useRef(null);

  // Close the export menu on outside click or Escape (mirrors the nav dropdown).
  // Escape also returns focus to the trigger so keyboard focus isn't lost to body.
  useEffect(() => {
    if (!exportOpen) return undefined;
    const onDown = (e) => { if (!exportRef.current?.contains(e.target)) setExportOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") { setExportOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [exportOpen]);

  function choose(format) {
    setExportOpen(false);
    onExport?.(format);
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Map tools">
      <div className="toolbar-search">
        <SearchInput
          placeholder="Search neighbourhood…"
          names={names}
          onSelect={onSearch}
        />
      </div>
      <div className="toolbar-export" ref={exportRef}>
        <button
          ref={triggerRef}
          type="button"
          className="toolbar-btn"
          onClick={() => setExportOpen((o) => !o)}
          disabled={!onExport}
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          title="Export the selection (or all if none selected)"
        >
          <Icon d={ICON_EXPORT} />
          <span className="toolbar-btn-label">Export</span>
        </button>
        {exportOpen && (
          <div className="toolbar-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => choose("csv")}>CSV — all years</button>
            <button type="button" role="menuitem" onClick={() => choose("geojson")}>GeoJSON — polygons</button>
            <button type="button" role="menuitem" onClick={() => choose("png")}>PNG — map image</button>
          </div>
        )}
      </div>
    </div>
  );
}
