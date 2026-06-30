// =============================================================================
// ExportMenu.jsx
//
// A small "Export ▾" dropdown offering CSV / GeoJSON / PNG of the current scope
// (the selection, or all when nothing is selected — the caller's onExport reads
// selectedIds). Used in the analyst area-select toolset. Closes on outside click
// or Escape (which returns focus to the trigger).
//
// Props:
//   onExport (format) => void   — "csv-current" | "csv-timeseries" | "geojson" |
//                                 "png"; absent = disabled
// =============================================================================

import { useEffect, useRef, useState } from "react";

const ICON_EXPORT = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3";

export default function ExportMenu({ onExport }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function choose(format) {
    setOpen(false);
    onExport?.(format);
  }

  return (
    <div className="export-menu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="pa-tools-btn"
        onClick={() => setOpen((o) => !o)}
        disabled={!onExport}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Export the selection (or all if none selected)"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={ICON_EXPORT} />
        </svg>
        <span>Export</span>
      </button>
      {open && (
        <div className="export-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={() => choose("csv-current")}>CSV — current year</button>
          <button type="button" role="menuitem" onClick={() => choose("csv-timeseries")}>CSV — timeseries</button>
          <button type="button" role="menuitem" onClick={() => choose("geojson")}>GeoJSON — polygons</button>
          <button type="button" role="menuitem" onClick={() => choose("png")}>PNG — map image</button>
        </div>
      )}
    </div>
  );
}
