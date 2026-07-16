// =============================================================================
// mapControls.js
//
// Shared MapLibre right-rail control helpers, used by every neighbourhood-aggregate
// section (Property Assessment is the standard; Dwelling Units + Business Counts adopt
// it). Extracted from property-assessment/interactions.js so all sections build the
// same icon-button rail from ONE place rather than copying it.
//
//   • makeIconButtonControl — a MapLibre IControl for an icon-only rail button (search,
//     recentre, info, database). Icon-only, so `label` is BOTH tooltip and accessible
//     name; setLabel/setActive let a toggle retitle + glow in place (the rail's active
//     material, DESIGN_SYSTEM §6). The 18px glyph sits in a 30px slot (larger target).
//   • railGlyph — wraps a glyph BODY (from mapIcons.js) in the family's <svg> shell, so
//     the 18px / stroke-2 / round-caps family spec is stated once, not per control.
// =============================================================================

export function makeIconButtonControl({ svg, label, onClick }) {
  return {
    onAdd() {
      const wrap = document.createElement("div");
      wrap.className = "maplibregl-ctrl maplibregl-ctrl-group";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = svg;
      btn.addEventListener("click", onClick);
      this._btn = btn;
      this._wrap = wrap;
      // `label` may be a FUNCTION for a control whose action depends on state (see
      // setLabel + the recentre control). Resolve it once here for the initial mount.
      this.setLabel(typeof label === "function" ? label() : label);
      wrap.appendChild(btn);
      return wrap;
    },
    // Retitle in place. The SHAPE never changes — only the name for what it will do.
    setLabel(text) {
      if (!this._btn) return;
      this._btn.title = text;
      this._btn.setAttribute("aria-label", text);
    },
    // Mark the control ON/engaged. `.is-on` carries the rail's active material (petrol
    // body + pearl rim + teal glow, §6) — the same scheme MapLibre's own
    // .maplibregl-ctrl-shrink gets when fullscreen engages, so every toggle on the rail
    // reads identically. aria-pressed makes the state real for a screen reader, not just
    // visible: with no × on the popover, this button IS the close affordance.
    setActive(on) {
      if (!this._btn) return;
      this._btn.classList.toggle("is-on", !!on);
      this._btn.setAttribute("aria-pressed", on ? "true" : "false");
    },
    onRemove() {
      this._btn?.removeEventListener("click", onClick);
      this._wrap?.remove();
    },
  };
}

// Wrap a glyph BODY from mapIcons.js in the family's <svg> shell. One place decides the
// rendered size + stroke spec for every JS-drawn rail glyph, so the family spec is
// stated once rather than re-typed per control.
export function railGlyph(body) {
  return (
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
    'style="display:block;margin:auto">' + body + "</svg>"
  );
}
