// =============================================================================
// titleCase.js — DISPLAY transform: NAICS sentence-case → DESIGN_SYSTEM §2 Title Case.
//
// The source data is sentence case ("Real estate and rental and leasing"); the design
// system requires Title Case for every product label. This transforms at RENDER — it
// never touches the GeoJSON, the CSV, or the pipeline.
//
// THE RULE (DESIGN_SYSTEM §2, applied verbatim):
//   • Capitalize every word EXCEPT minor words when they fall mid-phrase — articles
//     (a/an/the), coordinating conjunctions (and/but/or/nor), prepositions ≤4 letters
//     (of/in/on/to/by/as/at/off/per/over/for/from/into/with/…), and "vs".
//   • ALWAYS capitalize the first and last word, AND the first word inside a "(" — a
//     parenthetical is its own phrase ("(Except Public Administration)").
//     NB "except" is 6 letters → NOT a minor word → capitalized (matches §2's ≤4-letter
//     rule AND the directive's own "(Except …)" example).
//   • HYPHENATED COMPOUNDS: capitalize BOTH parts ("Full-Service", "Non-Depository",
//     "Air-Conditioning"); a minor connector BETWEEN parts stays lower ("Business-to-Business").
//   • ACRONYMS / already-capitalised tokens survive verbatim — detected by an uppercase
//     letter AFTER the first character (the source is sentence case, so a normal word has
//     none): "RV", "C.E.G.E.P.s" are preserved; "Supercentres" capitalises to itself.
// No hand-authored exception list is needed — every one of the 297 industry groups + 20
// sectors is handled by the rule (see the CC report). The one source ODDITY is a missing
// space in "carriers(except satellite)"; the CASING is correct ("(Except Satellite)"),
// the spacing is preserved from source (a data-cleaning fix, not a display transform).
// =============================================================================

const MINOR = new Set([
  "a", "an", "the",                         // articles
  "and", "but", "or", "nor",                // coordinating conjunctions
  "of", "in", "on", "to", "by", "as", "at", "off", "per", "over",
  "for", "from", "into", "with", "up", "out", "via",   // prepositions ≤4 letters
  "vs",
]);

const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// A token keeps an acronym / mixed-case word verbatim (RV, C.E.G.E.P.s). Detected by an
// uppercase letter after the first char — the sentence-case source has none in a normal word.
const isAcronym = (w) => /[A-Z]/.test(w.slice(1));

// One word core (letters/digits + internal hyphens/periods/apostrophes, no surrounding
// punctuation). `force` = this word must capitalize regardless of minor status.
function caseWord(word, force) {
  if (isAcronym(word)) return word;                 // preserve acronyms/proper nouns
  if (word.includes("-")) {
    const parts = word.split("-");
    return parts.map((p, i) => {
      if (isAcronym(p)) return p;
      const mid = i !== 0 && i !== parts.length - 1;
      const lower = p.toLowerCase();
      return (mid && MINOR.has(lower)) ? lower : capFirst(lower);   // both ends cap; minor middle lower
    }).join("-");
  }
  const lower = word.toLowerCase();
  return (!force && MINOR.has(lower)) ? lower : capFirst(lower);
}

export function titleCase(str) {
  if (!str) return str;
  const WORD = /[A-Za-z0-9][A-Za-z0-9'’.-]*/g;   // a word core (keeps internal - . ')
  const matches = [...str.matchAll(WORD)];
  if (!matches.length) return str;
  const firstOffset = matches[0].index;
  const lastOffset = matches[matches.length - 1].index;
  return str.replace(WORD, (word, offset) => {
    const isFirst = offset === firstOffset;
    const isLast = offset === lastOffset;
    // phrase-first: directly preceded (ignoring spaces) by "(" → capitalize like a first word
    const startsParen = /\(\s*$/.test(str.slice(0, offset));
    return caseWord(word, isFirst || isLast || startsParen);
  });
}
