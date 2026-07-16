// =============================================================================
// SearchPeek.jsx
//
// The PA console's SINGLE unified search (D5). One control, presented as a
// magnifier "peek" button sitting with the map's zoom stack (top-right): collapsed
// it is just the magnifier icon; click it to reveal the search input. Driving it
// updates BOTH surfaces at once — coordinated views, not modes:
//   • onValueChange → the table's globalFilter (live, as you type)
//   • onSelect      → flyAndPinByName (map fly + pin)
// It replaces the old topbar SearchInput + the dock .dt-filter (their function is
// absorbed, not duplicated — No-Duplication, note 23/24). The search input stays
// MOUNTED across open/close (only its panel is hidden) so its value — and thus the
// coordinated table filter — persists; clearing the text clears the filter.
//
// Not a brush: search drives fly-to-pin (a focus/selection action) + the VIEW table
// filter. It never touches the VIEW-only range/District brush fence.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import SearchInput from "../../components/SearchInput.jsx";
import { ICON_SEARCH } from "./mapIcons.js";

export default function SearchPeek({ names, onSelect, onValueChange, value }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // The input stays mounted (value persists), so autoFocus won't re-fire — focus it
    // imperatively each time the peek opens.
    wrapRef.current?.querySelector(".search-input")?.focus();
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className={`pa-search-peek${open ? " is-open" : ""}`} ref={wrapRef}>
      {/* Panel always rendered (hidden via CSS when collapsed) so the search value +
          the coordinated table filter survive a collapse. */}
      <div className="pa-search-peek-panel">
        <SearchInput
          names={names}
          value={value}                 /* controlled by the parent's searchQuery (single source of truth) */
          onValueChange={onValueChange}
          onSelect={(name) => { onSelect?.(name); setOpen(false); }}
          placeholder="Search neighbourhood…"
        />
      </div>
      <button
        ref={btnRef}
        type="button"
        className="pa-search-peek-btn"
        aria-label="Search neighbourhoods"
        aria-expanded={open}
        title="Search neighbourhoods"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Lucide `map-pin-search` — a pin WITH a lens, because this control finds a
            PLACE and a bare lens is the universal "find text on this page". The body is
            injected because the glyph mixes <path> and <circle>; it is static in-repo
            text from mapIcons.js, never user input. */}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
             dangerouslySetInnerHTML={{ __html: ICON_SEARCH }} />
      </button>
    </div>
  );
}
