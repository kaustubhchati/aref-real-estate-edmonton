// =============================================================================
// introCard.js
//
// Persistence for the introductory usage card (the About & tips popover on its FIRST
// life). The card auto-opens once, for a first-time visitor, and is dismissed by their
// first successful SELECTION. After that it never auto-opens again on any visit — only
// the "i" reopens it.
//
// WHY THE TRIGGER IS A SELECTION AND NOTHING ELSE (KC's ratified model). The user reads a
// tip, tries it, reads the next — so the card must survive EXPLORATION: panning, zooming,
// scrolling, clicks that hit nothing, slider drags. Those are orientation, and killing the
// card mid-orientation is the failure mode. A selection is different: it is the terminal
// act of the loop the card teaches, and it is the exact moment the InfoRail populates and
// the console becomes meaningful — attention SHOULD move to the data. So the card cedes
// the stage then, and only then. It does not vanish into nothing; it becomes the "i".
//
// This is why the three obvious alternatives are all wrong, and none should be
// reintroduced as "standard popover behaviour":
//   • a TIMER yanks it away mid-read (the research's named failure);
//   • DISMISS-ON-ANY-INTERACTION kills it during exploration — the very thing it exists
//     to accompany;
//   • CLICK-OUTSIDE is the same mistake wearing a convention's clothes: on a map, clicking
//     empty space IS exploration.
//
// ONE-WAY. Dismissal is permanent and persisted. Clearing the selection does NOT bring the
// card back — the user has already been introduced, and re-teaching them is the
// auto-resurface the research warns against.
//
// STORAGE IS WRAPPED, and it fails SOFT in both directions. Safari private mode and
// hardened privacy settings THROW on access rather than returning null; an uncaught throw
// here would take the map down with it. A storage failure must cost a card, never a page.
// On a READ failure we return false = "not yet dismissed" = show the card: when we cannot
// know, the honest default is to introduce the map rather than stay silent.
// =============================================================================

const SEEN_KEY = "pa.introCard.dismissed";

export function introCardDismissed() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberIntroCardDismissed() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage unavailable — the card introduces itself again next visit, which is not
       worth a crash */
  }
}
