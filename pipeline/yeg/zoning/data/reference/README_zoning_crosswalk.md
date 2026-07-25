# Zoning family crosswalk — PROPOSED (awaiting KC ratification)

`zoning_family_crosswalk_<YYYYMMDD>.csv` maps every zoning **code** to a legible **family** so the
map can fill by ~10 families instead of 156 unreadable classes. `01_build_zoning.R` joins on `zoning`
and **stops** (`n_unmapped`) if the City introduces a code the crosswalk doesn't cover — the same
guard shape as building-permits' `job_category`. This is how a **bylaw amendment surfaces loudly**
instead of silently mis-colouring.

## Status: PROPOSED

Per `CLAUDE.md` §4.6, a code→family mapping is **curation, and curation is human-gated.** Every row
carries `status=PROPOSED`, `date_curated=2026-07-25`, `curated_by=CC`. **It must not ship until KC
ratifies it** (flip `status` to `RATIFIED`, or amend a family and re-run). The mapping is explicit
per code (not fuzzy matching, `CLAUDE.md` §4.7).

## Source

Families follow the **Edmonton Zoning Bylaw 20001** (in force 2024) functional zone groups:
Residential · Commercial · Mixed Use · Industrial · Agricultural and Rural · Direct Control ·
Parks and Open Space · Civic and Public Service · Future and Reserve · Heritage. The `description`
field is the readable input to each assignment. Special-area zones (Blatchford, Griesbach, Stillwater,
Paisley, Clareview Campus, Ambleside, Riverview, Marquis, Century Park, Edmonton Energy & Technology
Park, River Crossing) are mapped to their **function** (e.g. *Griesbach Low Rise Apartment* →
Residential) so the legend stays ~10 families, not one-per-special-area.

## Distribution (156 codes → 10 families → 11,516 polygons)

| Family | codes | polygons |
|---|---|---|
| Residential | 35 | 5,254 |
| Parks and Open Space | 13 | 2,052 |
| Civic and Public Service | 5 | 1,108 |
| Direct Control | 4 | 1,069 |
| Industrial | 13 | 779 |
| Commercial | 12 | 590 |
| Mixed Use | 66 | 371 |
| Agricultural and Rural | 5 | 151 |
| Future and Reserve | 2 | 141 |
| Heritage | 1 | 1 |

## Judgment calls KC should confirm (the ambiguous assignments)

These are the assignments a reasonable reviewer could place differently — listed rather than decided
quietly:

1. **`A` "River Valley" (324 polygons) → Parks and Open Space.** The `A` prefix reads Agricultural,
   but the description is the protected North Saskatchewan river valley (open space). Placed with
   Parks; confirm it isn't wanted under Agricultural.
2. **`RR` / `RAES` / `RCES` (Rural / Acreage / Country Residential) → Agricultural and Rural.** These
   are low-density rural residential; grouped with Agricultural per the bylaw's rural grouping.
   Could instead sit under Residential.
3. **`BE` "Business Employment" (472 polygons) → Industrial.** BE permits office + light-industrial;
   placed Industrial (its bylaw group). Could read as Commercial.
4. **`AED` / `MED` (Arena / Marquis Entertainment District) → Civic and Public Service.** Public
   entertainment districts; could read as Commercial or Mixed Use.
5. **`AJ` "Alternative Jurisdiction" (32 polygons) → Future and Reserve.** Genuinely non-municipal
   land (not city-zoned); parked in Future and Reserve for lack of a better standard family. A
   dedicated "Other / Non-Municipal" family is an option.
6. **`EETR` "Energy & Technology Industrial Reserve" → Industrial.** Grouped with its EET industrial
   cluster; the word "Reserve" could argue for Future and Reserve.
7. **`DC/INDES` "Direct Control / Industrial District" → Direct Control.** Industrial in character
   but Direct-Control-governed; placed with the DC family (the control mechanism dominates).
8. **`HA` "Heritage Area" (1 polygon) → Heritage (own family).** A single polygon; kept a distinct
   family for correctness rather than folded into Civic. Fold if a 1-item legend row is unwanted.
