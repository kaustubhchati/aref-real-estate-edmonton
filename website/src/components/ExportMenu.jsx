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
//   scopeCount    — # neighbourhoods these exports cover (0 = whole city)  [scope cue]
//   scopeKind     — "selected" | "filtered" | null — WHICH scope that count is, so the
//                   cue can say so. "filtered" = a facet (District / metric range) is
//                   narrowing the view; the export follows it, as the KPI cards do.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useScrollFade } from "./useScrollFade.js";
import { portalTarget } from "./portalTarget.js";

const ICON_EXPORT = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3";

export default function ExportMenu({ onExport, year, years = [], scopeCount = 0, scopeKind = null }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // fixed-position anchor for the PORTALED menu
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  // Fade the bottom edge while options remain below the fold (the list is
  // max-height + overflow-y:auto). Keyed on `open`: the menu only exists then.
  useScrollFade(menuRef, [open]);

  // Open ABOVE or BELOW the trigger by available room. The menu is PORTALED to
  // <body> (not nested in the toolbar) so the console's overflow:hidden can't clip
  // it — the D3 console is short, so a downward menu would otherwise be cut off.
  function openMenu() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      // Must be the menu's MAXIMUM width — this predicts the width before the menu
      // exists, so an under-estimate silently defeats the spill test below. It read 232
      // (the min-width) while the menu actually renders 407: a 175px error, and the
      // comment claiming it was "the widest the menu opens" was simply untrue.
      // .export-menu-list now caps at 420px; keep these two in sync.
      const MENU_W = 420; // .export-menu-list max-width
      const flipUp = window.innerHeight - r.bottom < 260; // not enough room below
      // Export sits at the console's RIGHT edge, so a left-anchored menu would spill
      // off the viewport. Right-anchor (menu's right edge → trigger's right edge, so it
      // opens leftward) whenever a left-anchored menu wouldn't clear the right margin.
      const spillsRight = r.left + MENU_W > window.innerWidth - 8;
      const horiz = spillsRight
        ? { right: Math.round(window.innerWidth - r.right) }
        : { left: Math.round(r.left) };
      const vert = flipUp
        ? { bottom: Math.round(window.innerHeight - r.top + 6) }
        : { top: Math.round(r.bottom + 6) };
      setPos({ ...horiz, ...vert });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;
    // The menu is portaled, so an outside-click test must check BOTH the trigger
    // wrapper and the (detached) menu node.
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    // A PAGE scroll or resize must close the fixed menu (it cannot track its trigger),
    // but capture:true also hears the menu's OWN list scrolling — and this list is
    // max-height:340px + overflow-y:auto. Closing on that makes it unscrollable. Its
    // content fits today (≈245px), so it never bit here; the District dropdown shares
    // this pattern and its 15 options did NOT fit, which is how it surfaced. Guarded
    // the same way so a sixth export format can never quietly reintroduce it.
    // `instanceof Node` is load-bearing: a scroll targeted at WINDOW makes contains()
    // throw, and the throw aborts the handler before it closes — leaving the menu hanging
    // open on the very page scroll this exists to catch. A non-Node target IS the page.
    const onScroll = (e) => {
      const t = e.target;
      if (t instanceof Node && menuRef.current?.contains(t)) return;   // the list scrolling itself
      setOpen(false);
    };
    const onResize = () => setOpen(false);               // window event — no target to test
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function choose(format) {
    setOpen(false);
    onExport?.(format);
  }

  // Live labels from state — no year literals (refresh-by-design).
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "";
  // Scope these exports cover — mirrors handleExport's precedence AND its filename
  // (N-selected / N-filtered / all). This cue is the only thing on the menu that says
  // what the file will hold, so it must never read "All Neighbourhoods" over an export
  // that is actually scoped.
  const scopeLabel = scopeCount > 0
    ? `${scopeCount} ${scopeKind === "selected" ? "Selected" : "In View"}`
    : "All Neighbourhoods";

  // Data-driven option table — rendered in a loop, not copy-pasted blocks.
  // `sidecar:true` items download a CSV + a provenance .txt.
  const GROUPS = [
    {
      key: "data", heading: "Data",
      items: [
        { format: "csv-current", title: `This Year (${year})`,
          sub: "One row per neighbourhood — spreadsheet / GIS.", sidecar: true },
        { format: "csv-timeseries", title: `All Years (${span})`,
          sub: "One row per neighbourhood × year — panel analysis.", sidecar: true },
        // Selection summary (item 7) — only with an aggregate (≥2 selected): the
        // honest rollup + city comparison, distinct from the per-neighbourhood rows.
        ...(scopeCount >= 2
          ? [{ format: "csv-aggregate", title: "Selection Summary",
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
        onClick={() => (open ? setOpen(false) : openMenu())}
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
      {open && pos && createPortal(
        <div className="export-menu-list" role="menu" ref={menuRef} style={{ position: "fixed", ...pos }}>
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
        </div>,
        // NOT document.body — that is unpainted while the map is fullscreen.
        portalTarget()
      )}
    </div>
  );
}
