// =============================================================================
// introCard.js  (shared — keyed persistence for a map's introductory usage card)
//
// The About & tips popover IS the introduction: on a first visit the map opens it
// automatically, it stays open through exploration (pan / zoom / clicks that hit nothing),
// and it dismisses ONE-WAY on the reader's first successful SELECTION — after that only the
// "i" reopens it. This is the behaviour Property Assessment established (ratified 2026-07-15);
// these helpers let Dwelling Units + Business Counts adopt it, each with its OWN storage key
// so each map introduces itself once. (PA keeps its own fixed-key content/property-assessment/
// introCard.js for now — a deferred de-dup; this is the keyed shared version.)
//
// STORAGE FAILS SOFT in both directions. Safari private mode / hardened privacy THROW on
// access rather than returning null; an uncaught throw here would take the map down with it.
// A storage failure must cost a card, never a page. On a READ failure we return false =
// "not yet dismissed" = show the card: when we cannot know, the honest default is to
// introduce the map rather than stay silent.
// =============================================================================

export function introCardDismissed(key) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function rememberIntroCardDismissed(key) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* storage unavailable — the card introduces itself again next visit, not worth a crash */
  }
}
