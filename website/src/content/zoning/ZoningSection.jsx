// =============================================================================
// ZoningSection.jsx — the Zoning section shell, on the AmenitySection pattern:
// ONE exclusive `view` of state seeded from ?view=, a SECTIONS table as the
// single source of the view list, deviation-only URL mirroring, and a fresh
// mount per view. The section is RATIFIED as two views — View 1 "Zones" (this
// build) and View 2 "Overlays" (v1.1, dataset 6w3s-58pv, not fetched) — so the
// seam is load-bearing now: ADDING VIEW 2 = one row in the views table + its
// own map component. If it would require touching ZoningZonesMap.jsx, the seam
// is in the wrong place.
//
// Deviations from AmenitySection, both deliberate:
//   • selector chrome is SUPPRESSED while there is one view — a visible
//     selector with a single option is a dead control (KC addendum);
//   • the CAMERA is preserved across view switches: the shell owns a cameraRef
//     the views write on moveend and land on when mounted, so switching
//     Zones ⇄ Overlays keeps the reader's frame (fresh mounts, shared camera).
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import EmptyState from "../../components/EmptyState.jsx";
import SegmentedControl from "../../components/SegmentedControl.jsx";
import ZoningZonesMap from "./ZoningZonesMap.jsx";

// The section catalogue. The FIRST view is the default (a bare URL).
// v1.1: View 2 = one row here ({ key: "overlays", label: "Overlays",
// component: ZoningOverlaysMap }) + that component — nothing else moves.
const SECTIONS = {
  zoning: {
    title: "Zoning",
    views: [
      { key: "zones", label: "Zones", component: ZoningZonesMap },
    ],
  },
};

export default function ZoningSection({ sectionKey = "zoning" }) {
  const section = SECTIONS[sectionKey];
  const views = section?.views ?? [];

  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState(() => {
    const q = searchParams.get("view");
    return views.some((v) => v.key === q) ? q : views[0]?.key;
  });

  // The camera survives view switches (fresh mounts, shared frame) — the views
  // write it on moveend and land on it when they mount.
  const cameraRef = useRef(null);

  // Mirror the view to the URL — deviation only, replace:true (the PA rule).
  // MERGE-writes: other params (the map's ?zone= permalink) must survive.
  useEffect(() => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (view && view !== views[0]?.key) p.set("view", view);
      else p.delete("view");
      return p;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- write on view change; views is section-const
  }, [view]);

  if (!section) {
    return <EmptyState title="Section not found" body="This zoning section is not configured." />;
  }

  const active = views.find((v) => v.key === view) ?? views[0];
  const View = active.component;

  // A selector with one option is a dead control — chrome appears with view 2.
  const selectorNode = views.length > 1
    ? <SegmentedControl label="View" options={views} value={view} onChange={setView} />
    : null;

  return (
    <View
      key={active.key}
      title={section.title}
      selectorNode={selectorNode}
      cameraRef={cameraRef}
    />
  );
}
