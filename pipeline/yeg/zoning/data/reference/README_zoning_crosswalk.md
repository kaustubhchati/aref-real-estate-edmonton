# Zoning family crosswalk — RATIFIED (KC, 2026-07-25)

`zoning_family_crosswalk_<YYYYMMDD>.csv` maps every zoning **code** to a legible **family** so the
map can fill by ~10 families instead of 156 unreadable classes. `01_build_zoning.R` joins on `zoning`
and **stops** (`n_unmapped`) if the City introduces a code the crosswalk doesn't cover — the same
guard shape as building-permits' `job_category`. This is how a **bylaw amendment surfaces loudly**
instead of silently mis-colouring.

## Status: RATIFIED

Ratified by KC on 2026-07-25 (every row `status=RATIFIED`, `date_curated=2026-07-25`,
`curated_by=CC`), subject to the three amendments below, now applied. A code→family mapping is
curation and is human-gated (`CLAUDE.md` §4.6); the mapping is explicit per code, never fuzzy
matching (§4.7).

### Amendments applied at ratification
1. **`HA` Heritage folded into Civic and Public Service.** A legend slot for one polygon in 11,516
   fails essential-versus-non-essential (`DESIGN_SYSTEM.md` §3). The `zoning` code + `description`
   remain on hover/select, so the heritage designation is not lost, just not a top-level fill class.
2. **`AJ` given its own family "Alternative Jurisdiction"** (removed from Future and Reserve). Land
   under another jurisdiction is not land reserved for future development, and that mislabel is one a
   planning reviewer catches on sight. It is **not** folded into Civic and Public Service either,
   because it is not a civic land use — it is land the City does not zone (32 polygons, a visible
   presence that warrants its own honest slot).
3. **"Industrial" renamed "Industrial and Employment."** `BE` Business Employment is 472 of the
   family's 779 polygons (61%), so the plain "Industrial" label understated the business-park share.
   The rename moves no code and leaves the bylaw-derived grouping unchanged.

## Source

Families follow the **Edmonton Zoning Bylaw 20001** (in force 2024) functional zone groups. The
`description` field is the readable input to each assignment. Special-area zones (Blatchford,
Griesbach, Stillwater, Paisley, Clareview Campus, Ambleside, Riverview, Marquis, Century Park,
Edmonton Energy & Technology Park, River Crossing) are mapped to their **function** (e.g. *Griesbach
Low Rise Apartment* → Residential) so the legend stays ~10 families, not one-per-special-area.

**Direct Control is a governance mechanism, not a land use** (KC ruling). DC / DC1 / DC2 / DC/INDES
all map to the **Direct Control** family regardless of the use they happen to govern — scattering
them by apparent character (e.g. DC/INDES → Industrial) would empty the family of meaning and hide
the fact that the site is under site-specific control.

## Distribution (156 codes → 10 families → 11,516 polygons)

| Family | codes | polygons |
|---|---|---|
| Residential | 35 | 5,254 |
| Parks and Open Space | 13 | 2,052 |
| Civic and Public Service | 6 | 1,109 |
| Direct Control | 4 | 1,069 |
| Industrial and Employment | 13 | 779 |
| Commercial | 12 | 590 |
| Mixed Use | 66 | 371 |
| Agricultural and Rural | 5 | 151 |
| Future and Reserve | 1 | 109 |
| Alternative Jurisdiction | 1 | 32 |

## Judgment calls (KC-confirmed)

Calls 1, 2, 4, 6, 7 stand as originally assigned; calls on Heritage, AJ and the Industrial label were
amended above.
1. **`A` "River Valley" (324 polys) → Parks and Open Space** (the protected river valley, not
   Agricultural despite the `A` prefix). *Confirmed.*
2. **`RR` / `RAES` / `RCES` (rural/acreage/country residential) → Agricultural and Rural.** *Confirmed.*
4. **`AED` / `MED` (Arena / Marquis Entertainment) → Civic and Public Service.** *Confirmed.*
6. **`EETR` "Energy & Technology Industrial Reserve" → Industrial and Employment** (with its cluster).
   *Confirmed.*
7. **`DC/INDES` → Direct Control** (DC is governance, not use — see the ruling above). *Confirmed.*
