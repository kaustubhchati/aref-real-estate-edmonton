# Neighbourhood Rescue Oracle

`neighbourhood_rescue_oracle.csv` — the single canonical reference for
reconciling neighbourhood numbers that appear in section data but do not match a
polygon in the current boundary file.

## What it is

When a section (Property Assessment, Building Permits, future sections)
aggregates to neighbourhood level and joins to the boundary file, some rows carry
a `neighbourhood_number` that has no matching polygon — because the number was
renamed, renumbered, merged, or is an annexation container / placeless sentinel.
Left unhandled, those rows are **silently dropped** at the join, losing real data
(this is the documented Class-1 silent-drop failure in the PA reconciliation
audit).

This oracle is the **one place** that records what each unmatched number should
become. Sections **read** it; sections do not each invent their own mapping. One
row per old number means two sections can never disagree about where a retired
number maps.

It is the **0-day base**: it exists before any section's rescue logic runs.
Section code is a *consumer*. When a section discovers a new unmatched number, it
adds a row here (after a human ruling) rather than handling it locally.

## Schema

| column | type | meaning |
|---|---|---|
| `old_number` | int | the unmatched neighbourhood number a section's data carries |
| `old_name` | string | the name as it appears in section data (for legibility / name-join fallback) |
| `resolution` | enum | the rescue category — see below |
| `new_number` | int / blank | the current neighbourhood number to remap to; **blank when `resolution = drop`** |
| `new_name` | string / blank | current display name (used for the rename label-override class); blank when dropped |
| `city` | string | `edmonton`, `calgary`, … — the oracle is multi-city; sections filter to their city |
| `reason` | string | why-not-what: the one-line justification for this row |
| `first_seen_section` | string | provenance — which section/script first established the row (`PA/08c`, `BP/03`, …) |
| `date_added` | YYYY-MM-DD | when the row was added |
| `effective_start` | YYYY-MM-DD / blank | optional: date the mapping becomes valid (for date-aware reconciliation; blank = always) |
| `effective_end` | YYYY-MM-DD / blank | optional: date it stops being valid (blank = open) |

### `resolution` enum (the four reconciliation classes + drop)

| value | meaning | uses `new_number`? |
|---|---|---|
| `rename` | same polygon, name and/or id changed (Oliver → Wîhkwêntôwin) | yes |
| `renumber` | id changed in the boundary file (Chappelle 5462 → 5471) | yes |
| `merge` | folded into another neighbourhood pre-aggregation (Heritage Valley AREA → TOWN CENTRE) | yes |
| `drop` | no live polygon — annexation container, placeless sentinel, or target the City has not published | **no (blank)** |

The enum is the key design choice: it replaces the free-text `reason` overload in
the legacy PA tables (where rename/renumber/typo/merge were distinguished only by
which file a row lived in). A consumer can now branch on `resolution`
deterministically.

## How a section consumes it (R)

```r
library(tidyverse)

oracle <- read_csv("<shared_or_section_path>/neighbourhood_rescue_oracle.csv",
                   show_col_types = FALSE) |>
  filter(city == "edmonton")

# Remappable rows: rename / renumber / merge all resolve old -> new number.
remap <- oracle |>
  filter(resolution %in% c("rename", "renumber", "merge")) |>
  select(old_number, new_number)

# Legitimate drops: known-placeless, do NOT investigate these each refresh.
drop_numbers <- oracle |>
  filter(resolution == "drop") |>
  pull(old_number)

# Apply BEFORE the polygon join, on the section's own number column:
section_data <- section_data |>
  mutate(
    neighbourhood_number = coalesce(
      remap$new_number[match(neighbourhood_number, remap$old_number)],
      neighbourhood_number
    )
  ) |>
  filter(!(neighbourhood_number %in% drop_numbers))
```

The *application* is the section's own (its data shape, its column name, its join
differ — which is why rescue is per-section). The *mapping facts* are the
oracle's. A section never decides where a number maps; it reads that here.

## The add-a-row contract

1. A section's join surfaces an unmatched number carrying units/value/rows.
2. The operator (KC) rules its resolution — `rename`/`renumber`/`merge` (with a
   `new_number`) or `drop` (placeless).
3. Add **one row** to this CSV with full provenance (`first_seen_section`,
   `date_added`, `reason`).
4. Never edit an existing row's `old_number`. Corrections to a mapping are a new
   `effective_start` or a documented edit, not a silent overwrite.
5. One number, one row. If two sections hit the same number, they share the row.

## Seed provenance & caveats

Seeded 2026-06-22 from the established Property Assessment reconciliation facts
(08/08b/08c/07 + the PA reconciliation audit). Notes:

- **Oliver/Wîhkwêntôwin, Chappelle, Heritage Valley** — verified against PA script
  logic and the audit. High confidence.
- **Lewis Farms (4485, `drop`)** — surfaced by 08b's TARGET-EXISTS guard as
  `unresolved_target_missing`; recorded as drop until the City publishes a
  polygon. Revisit if a future boundary file adds one.
- **Annexation containers (8885–8888, `drop`)** — the PA audit identifies these id
  numbers as umbrella containers that should be excluded, but their exact
  `old_name` strings here are **inferred, not confirmed against the boundary
  file**. Verify the names (and that all four ids exist) before relying on them;
  correct in place if the boundary file disagrees.

Building Permits has NOT yet contributed rows — its permit-only unmatched numbers
(the ~76 demolished / stranded-added units found in the 03 join diagnostic) are
pending KC's ruling and will be added under `first_seen_section = BP/03`.
