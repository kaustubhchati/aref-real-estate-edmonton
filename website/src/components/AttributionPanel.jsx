// =============================================================================
// AttributionPanel.jsx
//
// The "where this data came from" panel — opens from the DATABASE-glyph control in the
// map's bottom-right (a DISTINCT affordance from the top-right usage "i" / MapTipsPopover:
// different glyph, different treatment). It is the §6 HOME for the full attribution record,
// which is what makes the always-visible bottom strip safe to trim to links only:
//
//   • Data source   — City of Edmonton Open Data Portal (linked)
//   • Licence        — Open Government Licence – City of Edmonton (linked)
//   • Disclaimer     — the §6 honesty label (moved here OUT of the inline strip, never dropped)
//   • Basemap        — © CARTO, © OpenStreetMap contributors (licence-fixed wording; linked)
//
// Content is data-driven from siteConfig (dataSource + BASEMAP_SOURCES) — no hardcoded
// strings, one source of truth shared with the strip + the exports.
//
// Dismissal — THREE routes (attribution-consolidation §2, now this is the SOLE attribution
// surface): the database button (click to open, click to close), Esc, and click-OUTSIDE.
// (Click-outside was previously omitted; as the single attribution surface the panel adopts
// the standard three-way dismissal.) There is deliberately no ×. The outside handler excludes
// the bottom-right control cluster so the toggle button owns its own click (no reopen race).
//
// Props:
//   open    — visible? (parent-owned; the database control toggles it and glows while open)
//   onClose — dismiss (Esc here, or the database control)
//   dataset — OPTIONAL { label, url }: a section-specific SOURCE DATASET link, shown as an
//             extra "Dataset" row under "Data source". Used where a section's attribution
//             cited a specific dataset the generic portal link does not name (e.g. the
//             Business Census points map's "Edmonton Business Census" link) — so that
//             string survives the native-bar removal (attribution-consolidation §5: a
//             per-section string is kept, never normalised away). Omit → no Dataset row.
// =============================================================================

import { useEffect, useRef } from "react";
import { useScrollFade } from "./useScrollFade.js";
import { siteConfig, BASEMAP_SOURCES } from "../config/siteConfig.js";

export default function AttributionPanel({ open, onClose, dataset = null }) {
  const panelRef = useRef(null);
  const ds = siteConfig.dataSource;

  // Fade the bottom edge while content runs below the fold (same cue as the tips popover).
  useScrollFade(panelRef, [open]);

  // Esc closes — keyboard convention + a11y.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Click-OUTSIDE closes (§2). Exclude the panel itself AND the bottom-right control cluster
  // (the database toggle lives there and owns its own click — excluding it prevents the
  // classic close-then-reopen race where both the outside handler and the toggle fire).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (panelRef.current?.contains(t)) return;
      if (t?.closest?.(".maplibregl-ctrl-bottom-right")) return;
      onClose?.();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="pa-attrib-pop" role="dialog" aria-label="Data and attribution" ref={panelRef}>
      <div className="pa-tips-hd">
        <span className="pa-tips-h">Data &amp; Attribution</span>
      </div>

      <dl className="pa-attrib-list">
        <dt>Data source</dt>
        <dd>
          <a href={ds.url} target="_blank" rel="noopener noreferrer">{ds.name} Portal</a>
        </dd>

        {/* Optional per-section dataset link — preserves a section-specific source string
            (e.g. "Edmonton Business Census") that the generic portal link doesn't name. */}
        {dataset && (
          <>
            <dt>Dataset</dt>
            <dd>
              <a href={dataset.url} target="_blank" rel="noopener noreferrer">{dataset.label}</a>
            </dd>
          </>
        )}

        <dt>Licence</dt>
        <dd>
          <a href={ds.termsUrl} target="_blank" rel="noopener noreferrer">{ds.licence}</a>
        </dd>

        <dt>Basemap</dt>
        <dd>
          {/* Licence-fixed wording: the "©" and " contributors" ride OUTSIDE the links
              (pre/post) so the visible text reads "© CARTO" / "© OpenStreetMap
              contributors" verbatim — never iconified, abbreviated, or trimmed. */}
          {BASEMAP_SOURCES.map((s, i) => (
            <span key={s.label}>
              {i > 0 && ", "}
              {s.pre}
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
              {s.post}
            </span>
          ))}
        </dd>
      </dl>

      {/* The licence's OWN attribution sentence, which it requires: "You must,
          where you do any of the above: Acknowledge the source of the Information
          by including any attribution statement specified by the Information
          Provider(s)". It leads the disclaimer because it is an obligation, where
          the disclaimer is a note about what the data is not. Verbatim from
          siteConfig; never reworded, shortened, or stripped of its full stop. */}
      <p className="pa-box-ref">{ds.attributionStatement}</p>

      {/* §6 honesty label — the disclaimer, in prose. Its home is HERE (moved out of the
          strip); muted tier, never stripped, never compressed. */}
      <p className="pa-box-ref">{ds.disclaimer}</p>
    </div>
  );
}
