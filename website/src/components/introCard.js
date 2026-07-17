// =============================================================================
// introCard.js  (shared — keyed persistence for a map's introductory usage card)
//
// The About & tips popover IS the introduction: on the FIRST-EVER visit the map opens it
// automatically and marks it seen (localStorage) on that first load — so it shows ONCE and a
// reload does NOT re-show it (no reload persistence). It stays open through exploration and
// steps aside on the first selection; afterwards only the "i" reopens it. Each map passes its
// OWN key so each introduces itself once (pa. / du. / bc.).
//
// STORAGE FAILS SOFT in both directions. Safari private mode / hardened privacy THROW on
// access rather than returning null; an uncaught throw here would take the map down with it.
// A storage failure must cost a card, never a page. On a READ failure we return false =
// "not yet seen" = show the card: when we cannot know, the honest default is to introduce the
// map rather than stay silent.
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
