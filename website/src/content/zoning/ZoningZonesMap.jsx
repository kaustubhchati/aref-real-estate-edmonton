// =============================================================================
// ZoningZonesMap.jsx — View 1 of the Zoning section: the base-zone FAMILY map.
//
// Named for the VIEW, not the section (the Business Census naming-trap lesson:
// BusinessCensusMap vs BusinessCensusSection serve different routes; explicit
// view-named files stop that recurring). The section shell (ZoningSection)
// mounts this; View 2 (Overlays, v1.1) will be its own component — adding it
// must not touch this file.
//
// The map: 11,518 zoning polygons flat-filled by their family in the
// ALGORITHMICALLY DERIVED banded palette (zoningStyle.js — the frozen _oneshot
// derivation is the spec), the dissolved family boundaries at district zoom,
// family-tinted zone hairlines at zone zoom, the city-limit line, and a
// per-instance ground treatment that mutes the basemap under the fill. The
// HIGHLIGHT REGISTER rides feature-state: hover = lightness-lifted fill +
// near-white casing (preview); selected = near-black casing (commitment).
// Everything data-driven from the zoning manifest — no family/year literal here.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import MapView, { findFirstSymbolLayerId } from "../../components/MapView.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import ZoningLegendStrip from "./ZoningLegendStrip.jsx";
import ZoningRail from "./ZoningRail.jsx";
import { applyCameraPreset, ZONING_HOME_VIEW } from "../../components/mapCamera.js";
import { makeIconButtonControl, railGlyph } from "../../components/mapControls.js";
import { ICON_RECENTRE } from "../../components/mapIcons.js";
import { siteConfig } from "../../config/siteConfig.js";
import { assetUrl } from "../../utils/assetUrl.js";
import {
  BASEMAP_STYLE, MAP_VIEW, SOURCE_ID, BOUNDS_SOURCE_ID, LIMIT_SOURCE_ID,
  LRT_SOURCE_ID, FILL_ID, HAIRLINE_ID,
  buildZoningDomain, zoningFillLayers, familyLineLayer, hairlineLayer,
  cityLimitLayer, lrtLayer, applyZoningGround, buildFillPaint, zoningLineTint,
  buildSelectedPaint, zoningLineTintSelected, buildChipPreviewPaint,
} from "./zoningStyle.js";

const ZONING_HOME = ZONING_HOME_VIEW.Edmonton;

const MANIFEST_URL = assetUrl("/data/zoning/manifest.json");

export default function ZoningZonesMap({ title, selectorNode, cameraRef }) {
  const [entry, setEntry] = useState(null);        // the zoning_bylaw manifest record
  const [boundsFile, setBoundsFile] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [map, setMap] = useState(null);
  const [selected, setSelected] = useState(null);  // { id, props } — pinned zone
  const [hovered, setHovered] = useState(null);    // props — hover preview
  const [isolated, setIsolated] = useState(null);  // family key ISOLATED via the strip, or null
  const [chipPreview, setChipPreview] = useState(null);  // family under the strip cursor (§2)
  const [searchParams, setSearchParams] = useSearchParams();
  const restoredRef = useRef(false);               // ?zone= permalink restored once

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((m) => {
        if (cancelled) return;
        const bylaw = m.layers?.find((L) => L.id === "zoning_bylaw");
        if (!bylaw) throw new Error('Layer "zoning_bylaw" not in the zoning manifest.');
        setEntry(bylaw);
        setBoundsFile(m.layers?.find((L) => L.id === "zoning_family_boundaries")?.file ?? null);
      })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Families ordered by AREA SHARE desc, styled from the derived table.
  const domain = useMemo(() => (entry ? buildZoningDomain(entry) : null), [entry]);
  const domainByKey = useMemo(
    () => (domain ? Object.fromEntries(domain.map((it) => [it.key, it])) : null),
    [domain],
  );
  const layers = useMemo(
    () => (domain ? [...zoningFillLayers(domain), hairlineLayer(domain)] : null),
    [domain],
  );

  useEffect(() => {
    document.title = entry ? `${title ?? entry.label} · Edmonton` : "Open Data Centre";
    return () => { document.title = "Open Data Centre"; };
  }, [entry, title]);

  // ── Map load: bounds source + family lines, ground treatment, camera ─────────
  const recentreAddedRef = useRef(false);
  function handleMapLoad(m) {
    setMap(m);
    if (import.meta.env.DEV) window.__zoningMap = m;
    const firstSymbol = findFirstSymbolLayerId(m);
    // The family-boundary rung rides its OWN source (the dissolved backend emit),
    // so it is added here, not via MapView's single-source layers prop.
    if (boundsFile && !m.getSource(BOUNDS_SOURCE_ID)) {
      m.addSource(BOUNDS_SOURCE_ID, { type: "geojson", data: assetUrl(`/data/zoning/${boundsFile}`) });
      m.addLayer(familyLineLayer(), firstSymbol);
    }
    // The city-limit line: the island's edge, named. Added before the ground
    // treatment so the promoted roads/water draw over it.
    if (!m.getSource(LIMIT_SOURCE_ID)) {
      m.addSource(LIMIT_SOURCE_ID, { type: "geojson", data: assetUrl("/geo/edmonton_boundary.geojson") });
      m.addLayer(cityLimitLayer(), firstSymbol);
    }
    // LRT — civic infrastructure reference (published amenities route lines).
    if (!m.getSource(LRT_SOURCE_ID)) {
      m.addSource(LRT_SOURCE_ID, { type: "geojson", data: assetUrl("/data/amenities/lrt_lines.geojson") });
      m.addLayer(lrtLayer(), firstSymbol);
    }
    // Per-instance ground: mute basemap land-use, lighten, promote water + white
    // streets over the fill (contained to this map — applyDeepenedGround precedent).
    applyZoningGround(m, firstSymbol);
    // Land on the section camera: the shell preserves it across views (v1.1 seam);
    // first entry uses the shared home preset.
    applyCameraPreset(m, cameraRef?.current ?? ZONING_HOME, { ease: false });
    if (!recentreAddedRef.current) {
      m.addControl(makeIconButtonControl({
        svg: railGlyph(ICON_RECENTRE),
        label: "Return to home view",
        onClick: () => applyCameraPreset(m, ZONING_HOME, { ease: true }),
      }), "top-right");
      recentreAddedRef.current = true;
    }
  }

  // Preserve the camera for the section shell (view switches keep the frame).
  useEffect(() => {
    if (!map || !cameraRef) return undefined;
    const save = () => {
      cameraRef.current = {
        center: map.getCenter().toArray(),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      };
    };
    map.on("moveend", save);
    return () => { map.off("moveend", save); };
  }, [map, cameraRef]);

  // ── Hover + click-pin (optical pass 7 §4). FEATURE-STATE ONLY — no setFilter
  //    anywhere in the hover path (setFilter is documented to fail above 10k
  //    features; we have 11,518). The source rides promoteId:"id", so a zone
  //    split across internal tile boundaries takes hover state on EVERY part.
  //    mousemove is throttled to ~16ms; the FILL/casing state follows the
  //    cursor immediately (cheap), while the RAIL updates on PAUSE — the
  //    reading settles when the cursor does (SETTLE_MS delay, SETTLE_PX
  //    tolerance), not on every boundary crossed in transit.
  const SETTLE_MS = 120;
  const SETTLE_PX = 4;
  // Mirrors `selected != null` for the hover handlers (§2: while a zone is
  // pinned, hover must not repaint the field — the selection owns the
  // highlight until cleared). A ref, not state — the handlers live in a
  // [map]-keyed effect and need the live value without re-binding.
  const pinnedRef = useRef(false);
  useEffect(() => {
    if (!map) return undefined;
    let lastHoverId = null;
    let lastMoveT = 0;
    let settleTimer = null;
    let lastPt = null;
    let dragging = false;
    const setHoverFs = (id) => {
      if (id === lastHoverId) return;
      try {
        if (lastHoverId != null) map.setFeatureState({ source: SOURCE_ID, id: lastHoverId }, { hover: false });
        if (id != null) map.setFeatureState({ source: SOURCE_ID, id }, { hover: true });
      } catch { /* map tearing down */ }
      lastHoverId = id;
    };
    function onMove(e) {
      if (dragging) return;
      // §2: a pinned selection owns the highlight — no hover paint, no readout
      // churn. The cursor stays a pointer (clicking another zone re-pins).
      if (pinnedRef.current) {
        map.getCanvas().style.cursor = "pointer";
        setHoverFs(null);
        if (settleTimer) clearTimeout(settleTimer);
        return;
      }
      const now = performance.now();
      if (now - lastMoveT < 16) return;          // ~16ms throttle
      lastMoveT = now;
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const f = e.features[0];
      setHoverFs(f.id);                          // paint state: immediate
      // Rail state: on settle only (one reusable update path — setState, no
      // per-move component recreation; React re-renders the same rail).
      const pt = e.point;
      if (settleTimer) clearTimeout(settleTimer);
      const from = { x: pt.x, y: pt.y, props: f.properties };
      lastPt = from;
      settleTimer = setTimeout(() => {
        if (lastPt && Math.hypot(lastPt.x - from.x, lastPt.y - from.y) <= SETTLE_PX) {
          setHovered(from.props);
        }
      }, SETTLE_MS);
    }
    function onLeave() {
      map.getCanvas().style.cursor = "";
      setHoverFs(null);
      if (settleTimer) clearTimeout(settleTimer);
      setHovered(null);
    }
    function onSelect(e) {
      if (!e.features?.length) return;
      const f = e.features[0];
      // The selection takes over from the hover preview at once (the ref flips
      // here, not in the effect, so no mousemove sneaks a hover in between).
      pinnedRef.current = true;
      setHoverFs(null);
      if (settleTimer) clearTimeout(settleTimer);
      setHovered(null);
      // A selection is the MORE SPECIFIC focus, so it CLEARS any active isolate
      // (KC ruling, pass 13 §4): the two are mutually exclusive — never a
      // legend chip pressed for family A while a zone in family B is pinned.
      // Clearing the selection then returns to full colour, not the isolate.
      setIsolated(null);
      setSelected({ id: f.id, props: f.properties });
    }
    function onDismiss(e) {
      const box = [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]];
      if (!map.queryRenderedFeatures(box, { layers: [FILL_ID] }).length) setSelected(null);
    }
    // Cursor feedback: pointer over a zone; grab(bing) while dragging.
    function onDragStart() { dragging = true; map.getCanvas().style.cursor = "grabbing"; }
    function onDragEnd()   { dragging = false; map.getCanvas().style.cursor = ""; }
    // Any CAMERA move (zoom / pan / fly) makes the hover reading stale: the lit
    // zone may no longer sit under the cursor, and no mousemove fires to refresh
    // it (pass 13 §4 — the orphaned-hover-on-zoom/pan defect). Clear the hover
    // highlight + rail on movestart so it never orphans; the next move re-reads.
    // Selection is a SEPARATE feature-state and is untouched (its pin survives
    // zoom/pan — verified).
    function onMoveStart() {
      setHoverFs(null);
      if (settleTimer) clearTimeout(settleTimer);
      setHovered(null);
    }
    // Escape clears the selection (click-outside is onDismiss above).
    function onKey(e) { if (e.key === "Escape") setSelected(null); }
    map.on("mousemove", FILL_ID, onMove);
    map.on("mouseleave", FILL_ID, onLeave);
    map.on("click", FILL_ID, onSelect);
    map.on("click", onDismiss);
    map.on("dragstart", onDragStart);
    map.on("dragend", onDragEnd);
    map.on("movestart", onMoveStart);
    window.addEventListener("keydown", onKey);
    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      map.off("mousemove", FILL_ID, onMove);
      map.off("mouseleave", FILL_ID, onLeave);
      map.off("click", FILL_ID, onSelect);
      map.off("click", onDismiss);
      map.off("dragstart", onDragStart);
      map.off("dragend", onDragEnd);
      map.off("movestart", onMoveStart);
      window.removeEventListener("keydown", onKey);
    };
  }, [map]);

  // Selection state → the commitment casing (persists until cleared).
  const lastSelectedRef = useRef(null);
  useEffect(() => {
    pinnedRef.current = selected != null;
    if (!map) return;
    try {
      if (lastSelectedRef.current != null) {
        map.setFeatureState({ source: SOURCE_ID, id: lastSelectedRef.current }, { selected: false });
      }
      if (selected?.id != null) {
        map.setFeatureState({ source: SOURCE_ID, id: selected.id }, { selected: true });
      }
      lastSelectedRef.current = selected?.id ?? null;
    } catch { /* map tearing down */ }
  }, [map, selected]);

  // ── Permalink (§5, the ZoLa precedent): the selection mirrors to ?zone=<id>
  //    (merge-writes so the section's ?view= param survives), and a shared
  //    ?zone= URL restores the selection AND flies the camera to the zone.
  useEffect(() => {
    if (!restoredRef.current && !selected) return;   // don't wipe the param before restore
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (selected?.id != null) p.set("zone", String(Math.round(selected.id)));
      else p.delete("zone");
      return p;
    }, { replace: true });
  }, [selected]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map || !entry || restoredRef.current) return;
    restoredRef.current = true;
    const zoneParam = searchParams.get("zone");
    if (!zoneParam) return;
    const zoneId = Number(zoneParam);
    // The permalink is the one path that needs the raw GeoJSON (to recover the
    // zone's properties before it is tiled into view) — fetched only here.
    // The CAMERA stays at the section home (pass 11 §1): with the selection
    // inversion (§2) the pinned zone is the only coloured zone, so it is
    // locatable from the city frame — no fly-to.
    fetch(assetUrl(`/data/zoning/${entry.file}`))
      .then((r) => r.json())
      .then((g) => {
        const f = g.features.find((x) => Number(x.properties.id) === zoneId);
        if (!f) return;
        setSelected({ id: Number(f.properties.id), props: f.properties });
      })
      .catch(() => { /* a stale permalink id fails soft — the map stays at home */ });
  }, [map, entry]);  // eslint-disable-line react-hooks/exhaustive-deps

  // FIELD PAINT — one effect owns the fill + hairline recolour, by state rank:
  //   pinned (pass 11 §2, selection inversion) — the selected zone is the
  //     SOLE figure; everything else drops to the isolate neutrals;
  //   chip preview (pass 12 §2) — the family under the strip cursor lifts to
  //     its hover hex over the current base (never while pinned);
  //   isolate — the picked family at its Band-C iso, remainder neutral;
  //   rest — the full palette.
  // Clearing a higher state restores whichever lower state is live. The
  // FAMILY boundary is the constant dark neutral and is never re-tinted
  // (optical pass 6 — the one line that never gives way).
  const hasSelection = selected != null;
  useEffect(() => {
    if (!map || !domain || !map.getLayer(FILL_ID)) return;
    try {
      map.setPaintProperty(FILL_ID, "fill-color",
        hasSelection ? buildSelectedPaint(domain)
          : chipPreview ? buildChipPreviewPaint(domain, isolated, chipPreview)
            : buildFillPaint(domain, isolated));
      if (map.getLayer(HAIRLINE_ID)) {
        map.setPaintProperty(HAIRLINE_ID, "line-color",
          hasSelection ? zoningLineTintSelected() : zoningLineTint(domain, isolated));
      }
    } catch { /* map tearing down */ }
  }, [map, isolated, domain, layers, hasSelection, chipPreview]);

  function toggleFamily(key) {
    // Clicking a legend chip while a zone is PINNED is a NEW focus intent
    // (pass 15 audit): drop the pin and isolate that family, so the click takes
    // effect IMMEDIATELY and visibly. Without this the isolate armed silently
    // behind the selection (buildSelectedPaint ignores it) and sprang into view
    // only when the pin was later dismissed — breaking the "clearing the
    // selection returns to full colour" invariant. Selection and isolate stay
    // mutually exclusive in BOTH directions now.
    if (selected) {
      setSelected(null);
      setIsolated(key);
      return;
    }
    setIsolated((cur) => (cur === key ? null : key));
  }

  // (The manifest currency line lost its home with the console reversal —
  // flagged in the pass-12 report; the About page still carries provenance.
  // `selectorNode` has no mount point either until Overlays lands — the v1.1
  // seam will need a small floating pill for it, decided then.)

  return (
    <article className="content-map pa-map zoning-map">
      <div className="pa-canvas">
        <div className="canvas-wrap">
          {fetchError ? (
            <EmptyState title="Could not load data"
              body="The zoning data failed to load. Try refreshing the page." />
          ) : (
            <>
              {!layers && <MapSkeleton />}
              {layers && (
                <MapErrorBoundary>
                  <MapView
                    className="canvas"
                    basemapStyle={BASEMAP_STYLE}
                    geojsonUrl={assetUrl(`/data/zoning/${entry.file}`)}
                    view={MAP_VIEW}
                    sourceId={SOURCE_ID}
                    // promoteId (not generateId): feature-state keys on the
                    // PARCEL id property, so a zone split across internal
                    // tile boundaries takes hover/selected state on every part.
                    sourceOptions={{ promoteId: "id" }}
                    layers={layers}
                    onLoad={handleMapLoad}
                    cooperativeGestures={false}
                    mapAttribution={siteConfig.mapAttributionStrip}
                  />
                </MapErrorBoundary>
              )}
            </>
          )}
        </div>

        {/* PROPORTIONAL LEGEND STRIP (pass 12 §2) — the only chrome at rest:
            two share encodings + labels, hover-preview + click-to-isolate.
            emphasis (§4): a pinned zone's family takes the chip hover
            treatment — rail and legend point at each other. */}
        {domain && (
          <ZoningLegendStrip
            domain={domain}
            isolated={isolated}
            emphasis={selected?.props?.zone_family ?? null}
            pinned={selected != null}
            onToggleFamily={toggleFamily}
            onHoverFamily={setChipPreview}
          />
        )}

        {/* TWO-STAGE RIGHT RAIL (pass 12 §3) — absent at rest; hover = the
            identity header, click = the pinned full reading. */}
        {layers && (
          <ZoningRail
            hovered={hovered}
            selected={selected}
            domainByKey={domainByKey}
            onClear={() => setSelected(null)}
          />
        )}
      </div>
    </article>
  );
}
