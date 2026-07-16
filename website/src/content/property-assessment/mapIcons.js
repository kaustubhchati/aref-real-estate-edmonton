// =============================================================================
// mapIcons.js
//
// The PA map's ICON FAMILY — ONE open-licensed set, vendored, for the whole right rail
// and the tips index. Replaces the previous hand-drawn "Feather-style" glyphs (KC's
// ratified set-replacement, 2026-07-15): no earlier glyph survives.
//
// SOURCE: Lucide 1.24.0 (https://lucide.dev) — glyph bodies copied verbatim from
// `lucide-static@1.24.0/icons/<name>.svg`. Each constant names its source icon below,
// so any glyph can be checked against upstream.
//
// LICENCE — ISC, NOT MIT. (The brief said MIT; the package ships ISC. Both are
// permissive, but ISC REQUIRES this notice travel with the copies, which is why it is
// reproduced here rather than merely linked.)
//
//   ISC License. Copyright (c) 2026 Lucide Icons and Contributors
//   Permission to use, copy, modify, and/or distribute this software for any purpose
//   with or without fee is hereby granted, provided that the above copyright notice
//   and this permission notice appear in all copies.
//   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
//   REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
//   FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT,
//   OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE,
//   DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
//   ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS
//   SOFTWARE.
//
// WHY VENDORED, NOT INSTALLED: CLAUDE.md §9 fixes the stack at React + Vite + MapLibre
// (+ Recharts, + @tanstack/react-table). An icon package would be a new dependency;
// copying openly-licensed artwork is not. 13 glyphs, no build step, no supply chain.
//
// WHY LUCIDE AND NOT THE BRIEF'S LEAD CANDIDATE: **Maki cannot dress this rail.** Maki
// is Mapbox's POI/marker set (cafe, park, rail-station) — it has no zoom, fullscreen,
// fit-bounds or info control glyph, so the rail could not be ONE Maki family, and mixing
// is the thing the brief forbids. Material Symbols (Apache-2.0) has full coverage but is
// a FILLED/variable-font language: adopting it would mean restyling every glyph to
// `fill: currentColor` and abandoning the stroke chassis the whole rail (and §1.5a) is
// built on. Lucide is stroke-native and its spec IS ours already — 24 viewBox, fill
// none, stroke currentColor, stroke-width 2, round caps/joins — so the family drops onto
// the existing chassis with the teal-on-interaction states intact.
//
// IP GUARD (the brief's, honoured): Google's MAPS product chrome is brand-licensed and
// is NOT copied here. The metaphor is not ownable; the drawing is. We take the
// conventions Google made universal (+/− zoom, corner-arrows fullscreen, fit-frame
// recentre) and take the ARTWORK from Lucide. Note `crosshair` and `locate-fixed` exist
// in this family and are deliberately NOT used: those mean "locate ME", and this map
// never geolocates.
//
// THE FAMILY SPEC (every glyph obeys it; the shells in interactions.js + the CSS
// data-URIs below encode it): viewBox 0 0 24 24 · fill none · stroke currentColor ·
// stroke-width 2 · round caps + joins · rendered 18px in a 30px slot.
//
// SILHOUETTE-FIRST (§1.3): a glyph must say what it does by SHAPE — no colour, no
// tooltip. §1.3 spends colour on meaning, so decorative icon hue would collide with a
// reserved role or invent one; teal-on-interaction IS the icon colour and means
// "interactive". Every glyph below was rendered at 18px and read before it was chosen.
// Two were rejected THERE: `maximize`/`minimize` (corner brackets) collided with
// `focus` — near-identical silhouettes two slots apart on the same rail — so fullscreen
// takes the ARROW pair (`expand`/`shrink`), which is also what the brief specifies.
//
// These are MARKUP strings, not path data: the real glyphs mix <path> and <circle>, so
// a `d`-only constant could not hold them. They are injected as-is (see railGlyph() and
// the <Glyph> components) — static, in-repo, trusted text.
// =============================================================================

// Search — a pin WITH a lens: this control finds a PLACE, not text on a page.
// lucide: map-pin-search
export const ICON_SEARCH =
  '<path d="M 12.248 21.969 a 1 1 0 0 1 -0.849 -0.17 C 9.539 20.193 4 14.993 4 10 a 8 8 0 0 1 16 0 C 20 10.42 19.961 10.841 19.888 11.262"/> <path d="m22 22-1.88-1.88"/> <circle cx="12" cy="10" r="3"/> <circle cx="18" cy="18" r="3"/>';

// Zoom in — the strongest metaphor on any map. Not made clever.
// lucide: plus
export const ICON_ZOOM_IN =
  '<path d="M5 12h14"/> <path d="M12 5v14"/>';

// Zoom out.
// lucide: minus
export const ICON_ZOOM_OUT =
  '<path d="M5 12h14"/>';

// Fullscreen — four corner arrows pointing OUT (universal).
// lucide: expand
export const ICON_FULLSCREEN =
  '<path d="m15 15 6 6"/> <path d="m15 9 6-6"/> <path d="M21 16v5h-5"/> <path d="M21 8V3h-5"/> <path d="M3 16v5h5"/> <path d="m3 21 6-6"/> <path d="M3 8V3h5"/> <path d="M9 9 3 3"/>';

// Fullscreen ON — the true INVERSE (arrows IN): a real state change, not a colour flip.
// lucide: shrink
export const ICON_FULLSCREEN_EXIT =
  '<path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8"/> <path d="M9 19.8V15m0 0H4.2M9 15l-6 6"/> <path d="M15 4.2V9m0 0h4.8M15 9l6-6"/> <path d="M9 4.2V9m0 0H4.2M9 9 3 3"/>';

// Recentre — corner brackets closing on a centre dot = FIT THE FRAME TO THE THING.
// lucide: focus
export const ICON_RECENTRE =
  '<circle cx="12" cy="12" r="3"/> <path d="M3 7V5a2 2 0 0 1 2-2h2"/> <path d="M17 3h2a2 2 0 0 1 2 2v2"/> <path d="M21 17v2a2 2 0 0 1-2 2h-2"/> <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>';

// Info — the circled i. Universal; not a place to invent.
// lucide: info
export const ICON_INFO =
  '<circle cx="12" cy="12" r="10"/> <path d="M12 16v-4"/> <path d="M12 8h.01"/>';

// Tips index: click to select.
// lucide: mouse-pointer-2
export const ICON_CLICK =
  '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>';

// Tips index: shift+drag a box.
// lucide: square-dashed-mouse-pointer
export const ICON_BOX_SELECT =
  '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/> <path d="M5 3a2 2 0 0 0-2 2"/> <path d="M19 3a2 2 0 0 1 2 2"/> <path d="M5 21a2 2 0 0 1-2-2"/> <path d="M9 3h1"/> <path d="M9 21h2"/> <path d="M14 3h1"/> <path d="M3 9v1"/> <path d="M21 9v2"/> <path d="M3 14v1"/>';

// Tips index: the year / value-range instruments.
// lucide: sliders-horizontal
export const ICON_SLIDERS =
  '<path d="M10 5H3"/> <path d="M12 19H3"/> <path d="M14 3v4"/> <path d="M16 17v4"/> <path d="M21 12h-9"/> <path d="M21 19h-5"/> <path d="M21 5h-7"/> <path d="M8 10v4"/> <path d="M8 12H3"/>';

// Tips index: the Data Console (T).
// lucide: table-2
export const ICON_TABLE =
  '<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>';

// Tips index: clear FILTERS (a funnel struck out).
// lucide: filter-x
export const ICON_CLEAR_FILTERS =
  '<path d="M12.531 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l.427-.473"/> <path d="m16.5 3.5 5 5"/> <path d="m21.5 3.5-5 5"/>';

// Tips index: clear SELECTION — a DIFFERENT glyph from filter-x, because they are two different undos.
// lucide: eraser
export const ICON_CLEAR_SELECTION =
  '<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/> <path d="m5.082 11.09 8.828 8.828"/>';

// The CLICK affordance — a cursor with click rays. Used INSIDE tip #3's input chip, so
// the reader sees the physical act (shift + click + drag), not the word "click" alone.
// lucide: mouse-pointer-click
export const ICON_MOUSE_CLICK =
  '<path d="M14 4.1 12 6"/> <path d="m5.1 8-2.9-.8"/> <path d="m6 12-1.9 2"/> <path d="M7.2 2.2 8 5.1"/> <path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>';
