// =============================================================================
// columns.js
//
// The Report Card table's column schema — data-driven per CLAUDE.md §6.
// Adding a column = append one row here; the table renders it automatically.
//
// Each column carries:
//   key          — property name in the parsed CSV row (matches header text)
//   label        — what the table header displays
//   format       — value → display string (imported from utils/format.js so
//                  popups + tables stay byte-identical for the same value)
//   numeric      — true for right-aligned + numeric-sort columns
//   suppressible — true if this value is hidden ("—") for low-N rows
//                  (matches the suppression rule from the map's popup)
// =============================================================================

import { fmtCurrency, fmtNumber, fmtPct, fmtYear, fmtArea } from "../../utils/format.js";

// The name column's display value is the raw string with a dash fallback —
// we don't import a formatter for that, just inline a tiny lambda.
const fmtName = (v) => (v == null || v === "" ? "—" : v);

export const COLUMNS = [
  { key: "Neighbourhood",                label: "Neighbourhood",       format: fmtName,     numeric: false, suppressible: false },
  { key: "n_properties",                 label: "N",                   format: fmtNumber,   numeric: true,  suppressible: false },
  { key: "median_assessvalue",           label: "Median assessed",     format: fmtCurrency, numeric: true,  suppressible: true  },
  { key: "avall_public",                 label: "Mean assessed",       format: fmtCurrency, numeric: true,  suppressible: true  },
  { key: "sd_assessedvalue",             label: "SD assessed",         format: fmtCurrency, numeric: true,  suppressible: true  },
  { key: "median_yearbuilt",             label: "Median year built",   format: fmtYear,     numeric: true,  suppressible: true  },
  { key: "pct_with_unit",                label: "% with unit",         format: fmtPct,      numeric: true,  suppressible: true  },
  { key: "avg_assessvalue_without_unit", label: "Mean (non-unit)",     format: fmtCurrency, numeric: true,  suppressible: true  },
  { key: "avg_lotsize",                  label: "Mean lot size",       format: fmtArea,     numeric: true,  suppressible: true  },
];

// Default sort: alphabetical by Neighbourhood, ascending.
export const DEFAULT_SORT = { key: "Neighbourhood", dir: "asc" };
