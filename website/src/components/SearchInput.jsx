// =============================================================================
// SearchInput.jsx
//
// Controlled <input> backed by a <datalist> for autocomplete. The parent owns
// the names list and the onSelect callback (typically `flyAndPinByName` from
// useChoroplethInteractions). This component is map-agnostic — pass it a
// names array and a callback and it works for any "type a name, pick from a
// list, do a thing" flow.
//
// Submit triggers: Enter key, or change event (datalist click).
// =============================================================================

import { useEffect, useId, useRef, useState } from "react";

export default function SearchInput({
  names,
  onSelect,
  placeholder = "Type a name…",
  hint,
  label,
}) {
  const [value, setValue] = useState("");
  const listId = useId();
  const inputRef = useRef(null);

  // Stable ref to onSelect — the native-event listener below should always
  // call the freshest callback without needing to re-attach on every render.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // The native `change` event fires once per commit (Enter, datalist-click,
  // or blur with a changed value). React's onChange maps to `input`, which
  // fires per-keystroke — wrong granularity for "submit". We do the change
  // listener via a ref + addEventListener to match 09's behaviour.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return undefined;
    function onCommit() {
      const v = el.value.trim();
      if (v) onSelectRef.current?.(v);
    }
    el.addEventListener("change", onCommit);
    return () => el.removeEventListener("change", onCommit);
  }, []);

  function onKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = value.trim();
      if (v) onSelect(v);
    }
  }

  return (
    <div className="search">
      {label && <label htmlFor={`${listId}-input`} className="search-label">{label}</label>}
      <input
        id={`${listId}-input`}
        ref={inputRef}
        className="search-input"
        type="text"
        list={listId}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <datalist id={listId}>
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>
      {hint && <div className="search-hint">{hint}</div>}
    </div>
  );
}
