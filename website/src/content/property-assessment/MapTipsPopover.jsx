// =============================================================================
// MapTipsPopover.jsx
//
// The "About & tips" popover — the map's canonical interaction reference. Opens from
// the "i" in the right rail (a map-level utility, so the rail is its home; it used to
// be a 10px text link in the left column's footer, which is not where anyone looks
// for help about a map).
//
// A VISUAL INDEX, not a list of sentences. Each tip carries the SAME glyph as the
// control it describes — the search tip shows the search glyph, the table tip the
// table glyph — so the popover doubles as a tip→control map. Reading a line tells you
// what to do; seeing its glyph tells you where. That is wayfinding, not decoration,
// which is why the glyphs come from mapIcons.js (the rail's own family) rather than
// being drawn for this panel.
//
// Keys are KEY-CAPS (⇧, T), not spelled out: the reader has to find a physical key,
// and a picture of the key is a better instruction than its name.
//
// THE HONESTY BLOCK IS NOT A TIP. The selection-aggregate disclosure stays PROSE at
// the foot, outside the index (§6 — honesty labels are never stripped, never
// compressed into a glyph line). It says the Mean is exact and the Median/YoY are
// approximations; that is a methodology statement a reader must be able to read as
// sentences, so it is deliberately shaped differently from the tips above it.
//
// The two CLEARS get two entries, one line each. They are two separate undos and the
// distinction is the useful part — crushing them onto one line is what made the old
// single line unreadable.
//
// THIS PANEL IS ALSO THE INTRODUCTORY USAGE CARD. On a first visit the parent opens it
// automatically and it stays open through exploration, dismissing only on the reader's
// first successful selection (see introCard.js for why that trigger, and no other).
//
// Props:
//   open       — visible? (parent-owned: first-visit auto-open, one-way dismissal, "i")
//   onClose    — dismiss. Reached by Esc here, or the "i" in the rail. NOT by
//                outside-click, and there is no × — see the handler below.
//   lastUpdated— manifest.last_updated (no literals — refresh-by-design)
// =============================================================================

import { useEffect, useRef } from "react";
import { useScrollFade } from "./useScrollFade.js";
import {
  ICON_CLICK, ICON_BOX_SELECT, ICON_SEARCH,
  ICON_SLIDERS, ICON_TABLE, ICON_MOUSE_CLICK,
} from "./mapIcons.js";

// One <svg> shell for the index glyphs — the same Lucide family + spec as the rail, one
// step down in size (§1.5a: 16px index glyph vs the rail's 18px). The body is injected
// because the glyphs mix <path> and <circle>; it is static in-repo text from mapIcons.js.
// aria-hidden: the tip's TEXT is the accessible content; the glyph is a wayfinding echo
// of the control, so announcing it would just repeat the line.
// `inline` = the glyph sits INSIDE a sentence/chip rather than in the index column, so it
// takes the smaller optical size and rides the text baseline.
function Glyph({ body, inline = false }) {
  const px = inline ? 12 : 16;
  return (
    <svg className={inline ? "pa-tip-glyph pa-tip-glyph--inline" : "pa-tip-glyph"}
         viewBox="0 0 24 24" width={px} height={px} fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" dangerouslySetInnerHTML={{ __html: body }} />
  );
}

// An INPUT CHIP — a physical thing the reader must find and press. `⇧ shift` names the
// key rather than showing a bare arrow (an unlabelled ⇧ teaches nothing to someone who
// doesn't already know it), and the click chip carries the pointer glyph beside the word.
// <kbd> is the right element for both: the spec's "user input", not keyboards only.
function Key({ children }) {
  return <kbd className="pa-key">{children}</kbd>;
}

// A scaled replica of a REAL console button — not a generic glyph. The visual-index
// principle taken literally: the tip shows the control you will go and look for, in the
// state where it does something (coral = actionable; it sits grey and inert in the
// console until then, so the coral version is the one worth teaching).
//
// NOT aria-hidden, deliberately — a DEVIATION from the brief's a11y note, which assumed
// these were icons. They are text pills, and they are the SUBJECT of their sentence: the
// line reads "Resets the Search, District and Range Filters" with no subject unless the pill is
// announced. Hiding it would leave a screen reader asking "what does?".
function BtnChip({ children }) {
  return <span className="pa-tip-btn">{children}</span>;
}

// THE INDEX — data-driven, rendered in a loop. Each row is {glyph, body}. Adding a tip
// is adding a row; nothing else moves.
const TIPS = [
  { key: "click", glyph: <Glyph body={ICON_CLICK} />,
    body: <>Click to Select a Neighbourhood</> },

  { key: "table", glyph: <Glyph body={ICON_TABLE} />,
    body: <>Press <Key>T</Key> for Data Console</> },

  // "SELECT AN AREA" (ratified) — plain and spatially honest: the reader IS drawing an
  // area on the map. It avoids the jargon ("box-select", "marquee") and it cannot be
  // confused with District or any data term. MATCHED PAIR with the "Deselects the Area"
  // tip below — the two share one noun, and if the term ever changes BOTH change.
  { key: "area", glyph: <Glyph body={ICON_BOX_SELECT} />,
    body: <><Key>⇧ shift</Key> + <Key><Glyph body={ICON_MOUSE_CLICK} inline /> click</Key> and drag to Select an Area</> },

  // The search tip carries the SEARCH control's own glyph — that is the index working.
  { key: "search", glyph: <Glyph body={ICON_SEARCH} />,
    body: <>Search to Find a Neighbourhood and Fly to It</> },

  { key: "sliders", glyph: <Glyph body={ICON_SLIDERS} />,
    body: <>Drag Slider Knobs to Select Year and Metric Range</> },

  // The two clears — one line each, each showing its REAL button. They are two separate
  // undos; the pills make that concrete, because they are the very things on screen.
  // Names the SEARCH (amended 2026-07-15): the button now clears it too, and a tip that
  // under-describes the control is the drift §2 exists to end.
  { key: "clearf", glyph: <BtnChip>Clear filters</BtnChip>,
    body: <>Resets the Search, District and Range Filters</> },
  { key: "clears", glyph: <BtnChip>Clear selection</BtnChip>,
    body: <>Deselects the Area</> },
];

export default function MapTipsPopover({ open, onClose, lastUpdated }) {
  const panelRef = useRef(null);

  // The content can outrun the panel on a short viewport; fade the bottom edge while
  // more remains below (the same cue the District/Export menus use).
  useScrollFade(panelRef, [open]);

  // Esc closes — keyboard convention, and a11y: a keyboard user must not have to tab to
  // the "i" to escape. It is not a second visual control, it is just not trapping people.
  //
  // THERE IS DELIBERATELY NO CLICK-OUTSIDE HANDLER. On a map, clicking empty space IS
  // exploration — the reader trying the gesture the card is teaching. Dismissing on it
  // would kill the card mid-orientation, which is the whole failure this model avoids.
  // "Standard popover behaviour" is the wrong instinct here; do not add it back. The card
  // is closed by: a first successful selection (the parent's one-way dismissal), the "i",
  // or Esc. Nothing else.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="pa-tips-pop" role="dialog" aria-label="About and tips" ref={panelRef}>
      {/* No × (ratified): the "i" in the rail is the SINGLE affordance — click to open,
          click to close, one control and one mental model. Its glow while open is what
          carries that, which is why the glow is load-bearing rather than decorative. */}
      <div className="pa-tips-hd">
        <span className="pa-tips-h">How to Use This Map</span>
      </div>

      <ul className="pa-tips-list">
        {TIPS.map((t) => (
          <li key={t.key}>{t.glyph}<span>{t.body}</span></li>
        ))}
      </ul>

      {/* §6 honesty label — PROSE, deliberately outside the index above. Never a glyph
          line, never compressed, never stripped. */}
      <p className="pa-box-ref">
        Selection aggregates: <b>Mean</b> is parcel-weighted (exact);{" "}
        <b>Median</b> (of neighbourhood medians) and <b>YoY</b> are
        neighbourhood-weighted approximations (≈).
      </p>
      {/* The CITATION/provenance line — a source citation, NOT the honesty hedge above.
          It reads at the primary tier (.pa-box-cite → --pa-ink), lifted out of the muted
          tier the aggregate-methodology block keeps (KC, 2026-07-16). */}
      <p className="pa-box-ref pa-box-cite">
        <span>Updated {lastUpdated ?? "—"}.</span>{" "}
        Some neighbourhoods were renamed (e.g. Oliver → Wîhkwêntôwin, 2025); a
        neighbourhood&apos;s full history shows under its current name.{" "}
        <a href="https://www.edmonton.ca/city_government/city_organization/naming-committee"
           target="_blank" rel="noopener noreferrer">
          Naming Committee
        </a>.
      </p>
    </div>
  );
}
