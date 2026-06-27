// =============================================================================
// SearchInput.jsx
//
// Controlled name search with a CUSTOM filtered dropdown (not a native <datalist>,
// which dumped the whole ~403-name list over the map on focus). Behaviour:
//   • no list until the user types,
//   • then a height-capped, scrollable result panel of substring matches
//     (bounded to the input's width, so it never overlays the right rail),
//   • arrow-key / Enter / click to select; Escape or outside-click to close.
//
// Map-agnostic: parent passes a `names` array and an `onSelect(name)` callback
// (typically flyAndPinByName). Selecting commits the name.
// =============================================================================

import { useEffect, useId, useRef, useState } from "react";

const MAX_RESULTS = 50; // hard cap on rendered rows; the panel scrolls within max-height

export default function SearchInput({
  names,
  onSelect,
  placeholder = "Type a name…",
  hint,
  label,
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const id = useId();

  const q = value.trim().toLowerCase();
  const matches = q
    ? names.filter((n) => n.toLowerCase().includes(q)).slice(0, MAX_RESULTS)
    : [];
  const showList = open && q !== "" && matches.length > 0;

  // Close on outside click (Escape is handled in onKeyDown while focused).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(name) {
    onSelect?.(name);
    setValue(name);
    setOpen(false);
    setActive(-1);
  }

  function onChange(e) {
    setValue(e.target.value);
    setOpen(true);
    setActive(-1);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && matches[active]) choose(matches[active]);
      else if (matches.length) choose(matches[0]);
      else if (value.trim()) onSelect?.(value.trim()); // forgiving: try the typed text
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="search" ref={wrapRef}>
      {label && <label htmlFor={`${id}-input`} className="search-label">{label}</label>}
      <input
        id={`${id}-input`}
        className="search-input"
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => { if (q) setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="search-results" id={`${id}-list`} role="listbox">
          {matches.map((n, i) => (
            <li
              key={n}
              role="option"
              aria-selected={i === active}
              className={`search-result${i === active ? " active" : ""}`}
              // onMouseDown (not onClick) + preventDefault so the input's blur
              // doesn't close the list before the selection registers.
              onMouseDown={(e) => { e.preventDefault(); choose(n); }}
              onMouseEnter={() => setActive(i)}
            >
              {n}
            </li>
          ))}
        </ul>
      )}
      {hint && <div className="search-hint">{hint}</div>}
    </div>
  );
}
