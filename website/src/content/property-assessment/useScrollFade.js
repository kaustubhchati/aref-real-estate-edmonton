// =============================================================================
// useScrollFade.js
//
// Marks a scroll container with data-more="1" while there is still content BELOW the
// fold, so CSS can draw a fade at its bottom edge — the at-rest cue that the list
// continues. Clears the flag once you reach the end, so a fully-scrolled list never
// implies a phantom row.
//
// Used by the two portaled menus (District facet + Export), whose lists are
// max-height + overflow-y:auto and do overflow: 15 districts are ~490px of options in
// a ~338px box. Extracted here on the SECOND use, per the house rule.
//
// WHY THIS NEEDS JS AT ALL — the CSS-only routes each fail on something:
//   • mask-image fades the bottom unconditionally, so the LAST option of a
//     fully-scrolled list fades too, implying more when there is none.
//   • the background-attachment:local scroll-shadow trick can tell which end you are
//     at, but backgrounds paint BEHIND the text — it draws a shadow over the panel,
//     not a fade of the content.
//   • scroll-driven animations (animation-timeline: scroll()) would do it properly in
//     pure CSS, but they are Chromium-only today and this has to work in Firefox and
//     Safari.
// So: one passive listener, one ResizeObserver, one attribute.
//
// The fade is only a CUE. It is not the scrollbar — see the note on .dt-facet-list in
// index.css for why macOS cannot be made to draw a persistent one.
// =============================================================================

import { useEffect } from "react";

/**
 * @param {{current: HTMLElement|null}} ref  the scroll container
 * @param {any[]} deps  re-attach when these change (the menus mount on open, so [open])
 */
export function useScrollFade(ref, deps = []) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    // 1px of slack: scrollTop is fractional on HiDPI, so an exact === comparison can
    // leave the fade stuck on at the very bottom.
    const update = () => {
      const more = el.scrollHeight - el.clientHeight - el.scrollTop > 1;
      el.dataset.more = more ? "1" : "";
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    // The list can change height without scrolling — a facet re-render, a font load, a
    // viewport resize — and then "is there more below" changes with no scroll event.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
