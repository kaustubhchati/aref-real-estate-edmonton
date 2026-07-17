// =============================================================================
// consoleControls.jsx  (shared — analyst Data Console UI leaves)
//
// The prop-driven UI controls of the Data Console tuning bay + KPI rail, shared across
// sections (Property Assessment is the source; Dwelling Units adopts them). Extracted
// from property-assessment/DataTable.jsx verbatim — each carries ZERO domain vocabulary
// (a dual-handle range slider is a dual-handle range slider), so they compose into any
// section's console. Styling is the shared global CSS (.pa-tune-*, .pa-dual-*, .dt-tile,
// .dt-facet-*) — no per-section styles.
//   • CalibTicks    — calibration ticks below a track
//   • YearSliderRow — single-handle year slider (snaps to year ticks)
//   • RangeFacet    — dual-handle metric-range slider (continuous; piecewise-capable)
//   • FacetDropdown — portaled multi-select facet menu (fullscreen-safe)
//   • KpiCard       — one KPI tile (label · value · city baseline · delta)
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useScrollFade } from "./useScrollFade.js";
import { portalTarget } from "./portalTarget.js";

// How close (in % of track) a thumb must come before the detent grabs it.
const DETENT_GRAB = 2;

// ── Calibration ticks below a track — the "this axis has positions, drag it" signal.
// `count` marks spaced evenly 0→100%; `majorEvery` (0 = none) thickens every Nth.
// Data-driven count (year count for Year; a fixed ruler for the continuous metric).
export function CalibTicks({ count, majorEvery = 0, ruler = false }) {
  const marks = [];
  for (let i = 0; i < count; i++) {
    const left = count === 1 ? 50 : (i / (count - 1)) * 100;
    marks.push(
      <i
        key={i}
        className={majorEvery && i % majorEvery === 0 ? "major" : undefined}
        style={{ left: `${left}%` }}
      />
    );
  }
  return <div className={`pa-tune-calib${ruler ? " ruler" : ""}`} aria-hidden="true">{marks}</div>;
}

// ── Year — SINGLE handle, snaps to discrete year ticks (step 1). Honest affordance:
// discrete years exist, so it snaps. Two-tier readout: the active year (accent, in a
// FIXED slot up top) vs the data-bound endpoints (muted, below the track). One tick per
// year — the ticks ARE the selectable values; the count is manifest-driven (a next-year
// refresh grows the track by one tick, no code change). slideYear throttle unchanged.
export function YearSliderRow({ year, sliderYear, slideYear, yMin, yMax }) {
  const val = sliderYear ?? year ?? yMin;
  const pct = ((val - yMin) / ((yMax - yMin) || 1)) * 100;
  const nYears = Math.max(1, yMax - yMin + 1);
  return (
    <div className="pa-tune-ctrl">
      <div className="pa-tune-ctrl-head">
        <span className="pa-tune-ctrl-name">Year</span>
        <strong className="pa-tune-active">{val}</strong>
      </div>
      <div className="pa-tune-track-wrap">
        <input
          type="range"
          className="pa-slider pa-year-slider"
          aria-label="Year"
          min={yMin}
          max={yMax}
          step={1}
          value={val}
          style={{ "--pct": pct }}
          onChange={(e) => slideYear(Number(e.target.value))}
        />
        <CalibTicks count={nYears} majorEvery={5} />
      </div>
      <div className="pa-tune-ends"><span>{yMin}</span><span>{yMax}</span></div>
    </div>
  );
}

// ── Metric range — DUAL handle, continuous glide (NO snapping). Honest affordance: the
// metric is continuous, so the marks below are an evenly-spaced RULER (reference only) —
// they must NOT imply discrete stops. Two-tier readout: the active range (accent, FIXED
// slot) vs the data-bound min/max (muted, below). FIXED slot: when the range doesn't
// apply (selection mode) or bounds are degenerate, it renders INERT (dimmed) rather than
// null — the frame never reflows. A `scale` with a detentPct drives the piecewise break
// (PA's YoY); a plain linearScale leaves that path dormant. The TanStack wiring
// (onChange → setFilterValue → the VIEW-only brush) is the caller's.
export function RangeFacet({ label, fmt, scale, value, onChange, disabled = false }) {
  const usable = scale && scale.min !== scale.max;
  const off = disabled || !usable;
  const { min, max } = usable ? scale : { min: 0, max: 1 };
  const [lo, hi] = usable && value ? value : [min, max];
  const piecewise = usable && scale.detentPct != null;

  // The thumbs ride the track in PERCENT space, not value space. A piecewise scale has
  // no single step size — one % is 0.4 log pts inside the core and 7.2 outside — and a
  // native range input only does linear. Percent is the one axis that is linear on ANY
  // scale, so the input stays native (keyboard, focus, a11y all free) and the scale does
  // the interpreting. aria-valuetext then announces the VALUE, since the raw input value
  // is now a position, which is not what a screen reader should read out.
  const toPct = usable ? scale.toPct : (v) => v;
  const toVal = usable ? scale.toVal : (p) => p;
  const clampP = (p) => Math.min(100, Math.max(0, p));
  // The detent GRABS: within DETENT_GRAB of the break the thumb sticks to exactly the
  // boundary, so crossing it takes a second, deliberate push. That resistance is the
  // felt half of the break; the gap in the track is the seen half.
  const snap = (p) => (piecewise && Math.abs(p - scale.detentPct) < DETENT_GRAB ? scale.detentPct : p);
  const commit = (which, rawPct) => {
    const p = clampP(snap(clampP(rawPct)));
    // Values commit at 1 decimal (what the readout shows) — EXCEPT at the two ends,
    // which commit the scale's exact bound. Rounding there would leave the thumb a hair
    // inside the track, so "the range spans everything" would never be true, the filter
    // would stay silently armed at the far right, and every null-value row would drop out
    // of the table with nothing on screen to explain why.
    const v = p >= 100 ? scale.max : p <= 0 ? scale.min : Math.round(toVal(p) * 10) / 10;
    onChange(which === "lo" ? [Math.min(v, hi), hi] : [lo, Math.max(v, lo)]);
  };

  return (
    <div className={`pa-tune-ctrl${off ? " is-off" : ""}${piecewise ? " pa-tune-ctrl--piecewise" : ""}`}>
      <div className="pa-tune-ctrl-head">
        <span className="pa-tune-ctrl-name">{label}</span>
        <strong className="pa-tune-active">{off ? "—" : `${fmt(lo)} – ${fmt(hi)}`}</strong>
      </div>
      <div className="pa-tune-track-wrap">
        <div className="pa-dual" style={{ "--lo": `${toPct(lo)}%`, "--hi": `${toPct(hi)}%` }}>
          <div className="pa-dual-track" />
          <div className="pa-dual-fill" />
          {/* The break, drawn AFTER the fill so the active range breaks with it and
              BEFORE the inputs so the thumbs still ride over it. */}
          {piecewise && (
            <div className="pa-dual-detent" style={{ "--detent": `${scale.detentPct}%` }} aria-hidden="true" />
          )}
          {/* When the thumbs COINCIDE, only the top one is grabbable, so raise whichever
              must move to separate them: `lo` clamps to ≤ hi (can only go DOWN), `hi`
              clamps to ≥ lo (can only go UP). So raise lo in the upper half (recovers a
              stuck [max,max]) and leave hi on top otherwise (recovers [min,min]). */}
          <input
            type="range" className="pa-slider pa-dual-input pa-dual-lo"
            min={0} max={100} step={0.1} value={toPct(lo)} disabled={off}
            style={{ zIndex: toPct(lo) > 50 ? 3 : 1 }}
            aria-label={`${label} minimum`} aria-valuetext={off ? undefined : fmt(lo)}
            onChange={(e) => commit("lo", +e.target.value)}
          />
          <input
            type="range" className="pa-slider pa-dual-input pa-dual-hi"
            min={0} max={100} step={0.1} value={toPct(hi)} disabled={off}
            style={{ zIndex: 2 }}
            aria-label={`${label} maximum`} aria-valuetext={off ? undefined : fmt(hi)}
            onChange={(e) => commit("hi", +e.target.value)}
          />
        </div>
        <CalibTicks count={11} ruler />
      </div>
      <div className="pa-tune-ends"><span>{off ? "—" : fmt(min)}</span><span>{off ? "—" : fmt(max)}</span></div>
    </div>
  );
}

// ── Facet dropdown — a multi-select PORTALED dark menu on a button trigger. Portaled
// (position:fixed, anchored under the trigger, flips UP when the short console leaves no
// room below) so it escapes the console's overflow:hidden and the fullscreen unpaint.
// Options are data-driven; ticking one toggles it in/out of the caller's column filter.
export function FacetDropdown({ label, options, selected, labelOf, onToggle, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  // Fade the bottom edge while options remain below the fold. Keyed on `open`.
  useScrollFade(menuRef, [open]);

  function openMenu() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      // Flip UP when a full-height menu would overflow the console bottom; open leftward
      // when a left-anchored menu would spill off the right edge. MENU_W must be the
      // menu's MAX width (.dt-facet-list caps at 240) — an under-estimate defeats the
      // spill test and the list sits flush against the window edge.
      const MENU_W = 240; // .dt-facet-list max-width
      const flipUp = window.innerHeight - r.bottom < 340;
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
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    // The menu is position:fixed at coordinates measured once, so a PAGE scroll or resize
    // must close it rather than let it drift. But a scroll that STARTS inside the menu's
    // own (max-height, overflow-y:auto) list is the user reading it — do not close on that.
    // `instanceof Node` is load-bearing: a scroll targeted at WINDOW makes contains() throw,
    // and the throw would abort the handler before it closes — so the menu would hang open
    // on exactly the page scroll this exists to catch. A non-Node target IS the page moving.
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

  return (
    <div className="dt-facet-dd" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`dt-facet-summary${open ? " is-open" : ""}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}{selected.length ? ` · ${selected.length}` : ""}
        <span className="dt-facet-caret" aria-hidden="true">▾</span>
      </button>
      {open && pos && createPortal(
        <div className="dt-facet-list" role="menu" ref={menuRef} style={{ position: "fixed", ...pos }}>
          {options.map((v) => (
            <label key={v} className="dt-facet-opt">
              <input type="checkbox" checked={selected.includes(v)} onChange={() => onToggle(v)} />
              <span>{labelOf(v)}</span>
            </label>
          ))}
        </div>,
        // NOT document.body — that is unpainted while the map is fullscreen.
        portalTarget(),
      )}
    </div>
  );
}

// ── KPI tile — label (+ optional "· City" scope suffix) · big value · footer (either a
// plain `foot` string, or the city baseline + a coloured delta). All display, no math —
// the caller passes formatted strings + a {txt, cls} delta.
export function KpiCard({ label, city, value, valueCls, delta, cityScope, cityName, foot }) {
  return (
    <div className="dt-tile">
      <div className="dt-tile-l">
        {label}{cityScope ? ` · ${cityName ?? "City"}` : ""}
      </div>
      <div className={`dt-tile-v${valueCls ? " " + valueCls : ""}`}>{value}</div>
      <div className="dt-tile-ft">
        {foot != null ? (
          <span className="dt-tile-foot">{foot}</span>
        ) : (
          <>
            {city != null && <span className="dt-tile-city">{city}</span>}
            {delta && <span className={`dt-tile-d ${delta.cls}`}>{delta.txt}</span>}
          </>
        )}
      </div>
    </div>
  );
}
