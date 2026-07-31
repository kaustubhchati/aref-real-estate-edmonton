# Zoning Session Record — Reversals and Rulings from the Build

**Assembled:** 2026-07-31
**Status:** Reference document. Not governing law. Where this contradicts CLAUDE.md,
DESIGN_SYSTEM.md, or METHODOLOGY.md, THOSE win — this exists to carry the *reasoning*
and the *dead ends* those docs record only as settled outcomes.
**Purpose:** The Zoning section reached its shipped form through several decisions that
were made, ratified, then REVERSED. The living docs record only the surviving decision.
Six months from now someone will look at the vivid non-conventional palette, the button
toggle, or the absent bottom console and re-propose the thing we already tried and dropped.
This record names each reversal and why it failed, so it is not re-litigated.

---

## 1. Section state

**Built (live at `/properties/zoning`, View 1 "Zones"):**
- Backend: `01_build_zoning.R` (zone polygons joined to the ratified 156→10 family crosswalk;
  fail-closed on unmapped/blank codes; `NA` = Natural Areas handled as a literal join key) +
  a family-boundary dissolve (`zoning_family_boundaries.geojson`) + `03_emit_manifest.R`
  (no-year currency manifest). Zoning is the FIFTH `_whirl.yaml` runner section (sole-publisher
  handoff to `website/public/data/zoning/`, 3 files).
- Frontend: `ZoningSection.jsx` (AmenitySection-pattern two-view shell) → `ZoningZonesMap.jsx`
  (categorical family fill, SVG-derived palette, zoom ladder, per-instance basemap mutation),
  the proportional legend strip (`ZoningLegendStrip.jsx`), the column legend table
  (`ZoningLegendRail.jsx`, side-docked under a "Legend" button), and the two-stage right rail
  (`ZoningRail.jsx`).

**Not built (deferred):**
- View 2 "Overlays" (Z2) — the ratified section's second view. One selector row + one component,
  currently a placeholder. See §5 for its three open recon questions.
- The `soon` catchment/other overlay layers.

**View state (KC ratified through 2026-07-31):** the two-view section is LOCKED
("Zones" now, "Overlays" v1.1); the selector chrome is suppressed while only one view exists;
camera is preserved across views by a shell-owned `cameraRef`.

---

## 2. Locked architectural decisions

**Family fill, never raw code.** The map fills by `zone_family` (10 curated families), not by
the 156 Zoning Bylaw codes. The code + description surface on hover/select; the family is the
figure. (METHODOLOGY D8.)

**Fail-closed classification.** The build halts on any code the crosswalk does not carry AND on
any blank code — the §4.7 curated-mapping pattern. An amendment to the bylaw surfaces loudly at
refresh, never as a silent mis-colour.

**Reading surfaces, not a data console.** A categorical polygon map has no ramp and no analyst
table — it reads through the proportional strip (area shares) + the column legend table (zones ·
area) + the two-stage rail (per-feature detail). This is the pattern a future categorical polygon
map inherits (DESIGN_SYSTEM §5).

**Per-instance basemap mutation is contained.** `applyZoningGround` mutes land-use to `#faf7ef`,
promotes water + white streets over the fill — applied PER MAP INSTANCE (the `applyDeepenedGround`
precedent), never globally. The working core (PA/amenities basemaps) is untouched.

---

## 3. Rejected approaches — do not re-propose

**LBCS / planning convention as the HUE SOURCE — adopted, then RETIRED (palette law v1→v3).**
The first palette drew family hues from land-use convention (residential yellow, commercial red,
industrial purple, …). It was retired: on an *exploration* instrument hue's job is DISCRIMINATION,
not semantics — the legend and the readout carry the meaning. Convention hues clustered
(three warm families collided) and could not be made CVD-safe without abandoning the convention
anyway. The shipped palette is DERIVED (Glasbey, CVD-aware, GTA-BRIGHT-5-seeded), not chosen.
**Do not re-propose "colour zoning the way planners colour zoning."**

**`QUALITATIVE_12` for the area fills — ruled INAPPLICABLE.** The amenity categorical palette
(`QUALITATIVE_12`) is ratified for SMALL MARKS on a dark casing. It does not govern AREA fills:
big translucent polygons on a light ground need lightness-carries-area banding + a chroma floor,
not twelve vivid disc hues. The polygon-fill law is a SEPARATE law (DESIGN_SYSTEM §1.4). **Do not
"just reuse QUALITATIVE_12" for the next polygon map.**

**Non-hue governance encoding — tried TWICE, abandoned both times.** Governance families
(Direct Control, Civic) were twice given a non-hue treatment so they'd read as "different in kind":
(v1) hatching/dot PATTERNS — they asserted figure weight at zooms that could not resolve them and
read as noise; (v2) near-NEUTRAL desaturated bases — they collapsed into the warm-cream ground and
vanished. Both retired. Governance families now take REAL hues at full chroma; the governance
distinction is carried by the RAIL READOUT in words. **Do not re-propose patterns or greyed bases
to mark governance zones.**

**Reference buildings REMOVED, then REINSTATED as a carve-out.** Buildings were first dropped
(a thematic map shows its figure, not building footprints), then reinstated as ACHROMATIC REFERENCE
TEXTURE — a height-tiered translucent charcoal-umber fill (out-of-palette, zone reads through),
minzoom 14 so the typology self-selects. This is COMPLIANT with the reference-building law, not a
deviation (DESIGN_SYSTEM §5 building-fill carve-out). **Do not re-remove buildings citing the
no-greys rule — that rule governs the FIGURE's palette, not the achromatic reference register.**

**Bottom DATA CONSOLE — built, then REVERTED to the legend strip.** An early pass built a
PA-style bottom data console for zoning. It was reverted: a categorical polygon map has no
per-feature numeric table worth a console — its "data" is area shares (the strip) + per-zone
detail (the rail). The console was replaced by the proportional legend strip on the same dark
glass. **Do not re-add a bottom data console to a categorical polygon map.**

**TAB toggle form — retired for the BUTTON form.** The legend rail's toggle was going to be a
tab/handle (the PA "Data Console · Press T" idiom). The panel-toggle standard is now UNCONDITIONAL:
the button form (labelled + icon, teal active, shortcut in tooltip). The zoning legend rail was
BUILT to the button form ("Legend", key `L` in tooltip). **Do not re-introduce the tab handle.**
(DESIGN_SYSTEM §6.)

**Deep link FLIES to the zone — changed to land on the CITY frame.** With selection inversion
(§2 in v1.20) the pinned zone is the sole figure, locatable from the whole-city home frame, so the
`?zone=` deep link lands on `ZONING_HOME_VIEW` and pins, rather than flying to the zone's extent.
**Do not "fix" the deep link to zoom to the zone — inversion makes the city frame correct.**

---

## 4. Palette rulings

**Hues are DERIVED, not chosen (law v3).** Glasbey greedy farthest-point under a CVD-aware
distance (min of normal / deuteranopia / protanopia CIE76), SEEDED with GTA-BRIGHT 5 so the
palette provably extends the site's vivid register; ≥25° pairwise hue spacing; chroma floor
C\*≥46. The derivation is a one-shot script under the section's `_oneshot/`, frozen after use;
the output hexes are committed into the style module. Re-deriving is a deliberate act, not a tweak.

**Lightness carries AREA.** Three bands — A (L\*≈85) for the two ≥30%-area families, B (L\*≈67)
mid, C (L\*≈54, saturated) for the sub-2% figures. Cross-band pairs separate on two channels,
the mitigation for running ten hues near the discrimination ceiling.

**Highlight is a SEPARATE channel.** Hover/selection ride feature-state — a lightness lift
(hue + chroma held) plus an achromatic-extreme casing (near-white preview, near-black `#141018`
commitment). The no-greys rule governs DATA FILLS; casings and chrome are a separate register.

**In-fill labels use ONE threshold, TWO tokens.** A value printed inside a chip takes ink derived
from the fill's WCAG luminance: L > 0.42 → dark `#2a2621`, else light `#faf6ec`. A single fixed
ink fails at one end of a banded palette. (DESIGN_SYSTEM §1.4.)

**KC ratification items reported with the build (measurements, not judgements):** ΔE / CVD /
moiré / adjacency were measured and reported for KC to ratify — including the Residential~Farmland
tritanopia separation (ΔE 10.7 with 181 abutting pairs), flagged as the palette's nearest pair
under tritanopia.

---

## 5. Open parameters (Z2 / Overlays — DEFERRED, three recon questions)

View 2 "Overlays" is ratified into the section shell (one selector row + one component) but not
built. Before it is, three recon questions are open:

1. **Which overlay dataset(s)?** The Overlays layer UID `6w3s-58pv` is UNFETCHED — confirm it is
   the intended overlay source, its geometry type, and whether one dataset or several feed the view.
2. **How do overlays COMPOSE with the family fill?** Overlays sit ON the zone fill (they modify,
   they don't replace) — decide the render order, the opacity, and whether the family fill mutes
   under an active overlay (the amenity "modifyingViewUid parent" precedent may apply).
3. **What is the overlay's reading surface?** The strip + table encode family AREA — an overlay is
   not an area partition. Decide whether Overlays reuses the strip/table, gets its own legend, or is
   a simple on/off layer with only the rail for detail.

---

## 6. Inherited hazards

- **A crosswalk change affects the ONE section it's in — but re-verify the family COUNTS in the
  build log after any crosswalk edit** (the fail-closed guard catches unmapped codes, not a
  mis-mapped one). The per-family counts in the build log + the manifest are the check.
- **`NA` is a real zone code (Natural Areas), NOT missing data.** Never `replace_na` or coerce it;
  it is a literal join key on both sides. A blank code is different (it HALTS). This is the single
  most re-introducible bug in the backend.
- **The palette hexes are COMMITTED literals, not computed at build.** The one-shot derivation is
  frozen; editing a hex by hand breaks the CVD/ΔE guarantees the measurements certified. Re-derive,
  don't hand-tune.
- **Per-instance basemap mutation must stay per-instance.** `applyZoningGround` is contained to the
  zoning map; it must never leak to the shared basemap theme (PA/amenities render their own hues).

---

## 7. Section history

- **v1.19 (2026-07-29)** — Zoning shipped end-to-end: NA literal-join fix (A/B proven, guard-tripped
  on a doctored copy), family-boundary dissolve, `03_emit_manifest.R`, fifth runner section, generic
  `categoricalPolygon.js` standard proven on school catchments first, `/properties/zoning` live.
- **v1.20 (2026-07-30)** — View 1 matured across six directive passes: whole-city home camera,
  selection inversion, proportional legend strip REPLACING the reverted bottom console, two-stage
  rail, compact attribution site-wide, DESIGN_SYSTEM §5/§6 amended. Palette reached law v3 (Glasbey
  derivation, GTA-BRIGHT-5 seed, lightness-carries-area).
- **v1.21 (2026-07-31, THIS pass)** — Console directive: PA-matched header card (IdentityCard,
  Edmonton/Calgary switcher), column-standardized legend rail (the legend TABLE colour-tier rule),
  strip chip TEXT FLOOR (proportional-above-a-floor so the smallest family clears its own number),
  session-persisted rail, `L` keyboard toggle. Panel-toggle standard ruled UNCONDITIONAL (button
  form; tab form retired). The five-section tab→button RETROFIT recon completed — see §8 below.

---

## 8. The panel-toggle retrofit — recon outcome (2026-07-31)

The unconditional button-toggle rule (DESIGN_SYSTEM §6) implies a retrofit of PA / DU / BC / BP /
amenities. The recon (5 read-only agents) found the retrofit is NOT the clean per-section chrome
swap the rule assumed, and per the "stop and report on load-bearing" gate it is HELD, not executed:

- **The only tab-form panels are the three Data Consoles** (PA `DataTable.jsx`, DU
  `PermitDataConsole.jsx`, BC-census `BusinessCensusConsole.jsx`). They SHARE the `.dt-handle`
  component/CSS, so a migration cannot be per-section-separable (which the retrofit requires)
  without duplicating the shared handle three times — itself a larger change than a chrome swap.
- **All three console handles are LOAD-BEARING** (the handle carries a live "N selected" / drilled
  state readout, anchors the tuning strip, encodes open/closed in its caret, auto-opens on
  box-select). The stop-and-report gate names exactly this case.
- **The icon-button popovers (i / attribution / search)** are the "neither tab nor button" cases —
  but they are §6-governed map-rail controls whose GLOW is the sole close affordance (no ×, no
  click-outside). Migrating them to labelled buttons contradicts the §6 map-rail icon-only chassis
  and the popover-as-documentation law. Held.
- **BP point map + amenities have NO tab-form panel** — nothing to migrate.

**Ruling owed from KC** before the retrofit proceeds: (a) may the three Data Consoles migrate as a
SINGLE shared-handle commit (relaxing per-section separability, since they are one component), and
(b) are the §6 icon-rail popovers in scope at all (they are governed by §6, not the panel-toggle
rule). Until ruled, the retrofit stays the DEFERRED campaign PHASE2_STATUS records.
