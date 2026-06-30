// =============================================================================
// ExportMenu.jsx
//
// The PA export surface — an "Export ▾" dropdown in the analyst toolset. Two
// labelled groups: Data (the two CSV shapes) and Map (GeoJSON, PNG). The CSV
// options name the SHAPE (not the format), reflect live state (active year + the
// manifest year span — no literals), and flag that each downloads a CSV + a
// provenance .txt pair. A scope cue shows whether the export covers the current
// selection or all of the city. Matches the existing gel chrome idiom; closes on
// outside-click / Escape (which returns focus to the trigger).
//
// Format strings: "csv-current" | "csv-timeseries" | "geojson" | "png" (unchanged
// from D2/D2a) plus "csv-aggregate" (D8 item 7) — the selection SUMMARY, offered in
// the Data group ONLY when ≥2 are selected (an aggregate exists). The other four are
// presentation-frozen; this file only adds the conditional fifth item.
//
// Props:
//   onExport (format) => void  — fires the format string; absent = disabled
//   year          — the active year (snapshot label)               [from state]
//   years         — the full years array (drives the timeseries span) [manifest]
//   selectedCount — # selected neighbourhoods (0 = whole city)      [scope cue]
// =============================================================================

import { useEffect, useRef, useState } from "react";

const ICON_EXPORT = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3";

export default function ExportMenu({ onExport, year, years = [], selectedCount = 0 }) {
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

  // Live labels from state — no year literals (refresh-by-design).
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "";
  // Scope these exports cover (mirrors the filename's N-selected vs all logic).
  const scopeLabel = selectedCount > 0 ? `${selectedCount} selected` : "All neighbourhoods";

  // Data-driven option table — rendered in a loop, not copy-pasted blocks.
  // `sidecar:true` items download a CSV + a provenance .txt.
  const GROUPS = [
    {
      key: "data", heading: "Data",
      items: [
        { format: "csv-current", title: `This year (${year})`,
          sub: "One row per neighbourhood — spreadsheet / GIS.", sidecar: true },
        { format: "csv-timeseries", title: `All years (${span})`,
          sub: "One row per neighbourhood × year — panel analysis.", sidecar: true },
        // Selection summary (item 7) — only with an aggregate (≥2 selected): the
        // honest rollup + city comparison, distinct from the per-neighbourhood rows.
        ...(selectedCount >= 2
          ? [{ format: "csv-aggregate", title: "Selection summary",
              sub: "Aggregate figures + city comparison — one row per measure.", sidecar: true }]
          : []),
      ],
    },
    {
      key: "map", heading: "Map",
      items: [
        { format: "geojson", title: "GeoJSON",
          sub: "Polygons — every year on each feature.", sidecar: false },
        { format: "png", title: "PNG",
          sub: "The current map image.", sidecar: false },
      ],
    },
  ];

  // Screen-reader name carrying the SHAPE + the pair cue (the cue is in the name,
  // never icon/colour-only).
  const a11yName = (it) =>
    `${it.title} — ${it.sub}${it.sidecar ? " Downloads a CSV plus a provenance text file." : ""}`;

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
          {GROUPS.map((g) => (
            <div
              className="export-menu-group"
              role="group"
              aria-label={g.key === "data" ? `Data exports — ${scopeLabel}` : "Map exports"}
              key={g.key}
            >
              <div className="export-menu-head" aria-hidden="true">
                <span>{g.heading}</span>
                {g.key === "data" && <span className="export-menu-scope">{scopeLabel}</span>}
              </div>
              {g.items.map((it) => (
                <button
                  key={it.format}
                  type="button"
                  role="menuitem"
                  className="export-menu-item"
                  onClick={() => choose(it.format)}
                  aria-label={a11yName(it)}
                >
                  <span className="export-menu-title">{it.title}</span>
                  <span className="export-menu-sub">
                    {it.sub}
                    {it.sidecar && <span className="export-menu-pair"> + provenance .txt</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
