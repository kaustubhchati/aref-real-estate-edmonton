// =============================================================================
// basemapStyle.js
//
// The one basemap style URL every section's map loads. It was duplicated as
// BASEMAP_STYLE in four per-section style files; defined once here instead, and
// resolved against the deploy base via assetUrl so it works at the host root or
// under a subpath. The four style files now re-export this, so consumers import
// BASEMAP_STYLE exactly as before — only its single definition moved.
//
// (This is the style URL only — the "Apple Classic" layer restyle is a separate
// concern in basemapTheme.js.)
// =============================================================================

import { assetUrl } from "../utils/assetUrl.js";

export const BASEMAP_STYLE = assetUrl("/styles/custom-basemap.json");
