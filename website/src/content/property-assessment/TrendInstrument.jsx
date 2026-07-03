// =============================================================================
// TrendInstrument.jsx
//
// The console's TREND frame (contract §4 / C8) — a hand-rolled SVG trend
// instrument (no chart dependency). It layers, back to front:
//   • a min–max ENVELOPE (translucent green) across the selection — N≥2 only
//   • a dashed muted CITY baseline (drawn when a `city` series is passed, N≥1)
//   • the scope LINE (green): city mean (N=0) / neighbourhood (N=1) / sel mean (N≥2)
//   • an active-year CORAL CURSOR tied to the tuning year
// Below a hairline: the matched-sample YoY bar STRIP (green up / coral down). A
// header carries the label + a top-right year·value readout; endpoints are labelled.
// A local hover crosshair moves the readout (VIEW-only). EXCLUDED by contract:
// click/drag-to-set-year, select-on-chart, axis grids, zoom/brush.
//
// Props:
//   label       — frame label ("Median value · City")
//   main        — the scope line, one value per year (null / -999 = gap)
//   city        — the dashed baseline per year, or null to omit (N=0)
//   envelope    — per-year [min,max] (or null entry), or null to omit (N≤1)
//   yoy         — the matched-sample YoY % per year (null = gap)
//   years       — the manifest year list
//   activeIndex — the tuning year's index (coral cursor)
//   fmt         — the metric's value formatter
//   scopeName   — legend name for the main line ("Wîhkwêntôwin" / "selection mean")
//   cityName    — legend name for the baseline (default "city")
// =============================================================================

import { useState } from "react";

const clean = (a) =>
  (a ?? []).map((v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v));

export default function TrendInstrument({
  label = "Trend",
  main = [],
  city = null,
  envelope = null,
  yoy = [],
  years = [],
  activeIndex = -1,
  fmt = (v) => v,
  scopeName = null,
  cityName = "city",
}) {
  const [hoverI, setHoverI] = useState(-1);

  const m = clean(main);
  const c = city ? clean(city) : null;
  const finite = m.filter((v) => v != null);
  const yearSpan = years.length ? `${years[0]}–${years[years.length - 1]}` : "";

  // A shape reader needs ≥2 points; below that show a calm note (never collapse).
  if (finite.length < 2) {
    return <div className="dt-trend dt-trend--empty">No trend for this selection</div>;
  }

  const n = m.length;
  const W = 300, H = 92, PADX = 8, PADT = 8, PADB = 12;

  // y-domain spans the main + city + envelope so nothing clips.
  const domain = [...finite];
  if (c) c.forEach((v) => v != null && domain.push(v));
  if (envelope) envelope.forEach((e) => e && (domain.push(e[0]), domain.push(e[1])));
  const min = Math.min(...domain), max = Math.max(...domain), span = max - min || 1;

  const xAt = (i) => (n <= 1 ? W / 2 : PADX + (i / (n - 1)) * (W - 2 * PADX));
  const yAt = (v) => H - PADB - ((v - min) / span) * (H - PADT - PADB);
  const linePts = (arr) => {
    const pts = [];
    arr.forEach((v, i) => { if (v != null) pts.push(`${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`); });
    return pts.join(" ");
  };

  // Envelope polygon: upper edge L→R, then lower edge R→L.
  let envPoly = null;
  if (envelope) {
    const up = [], lo = [];
    envelope.forEach((e, i) => {
      if (e) {
        up.push(`${xAt(i).toFixed(1)},${yAt(e[1]).toFixed(1)}`);
        lo.unshift(`${xAt(i).toFixed(1)},${yAt(e[0]).toFixed(1)}`);
      }
    });
    if (up.length) envPoly = up.concat(lo).join(" ");
  }

  const activeOk = activeIndex >= 0 && activeIndex < n;
  // The readout tracks the hover, falling back to the active (tuning) year.
  const readoutI = hoverI >= 0 ? hoverI : activeIndex;
  const readoutV = readoutI >= 0 && m[readoutI] != null ? m[readoutI] : finite[finite.length - 1];
  const readoutYear = readoutI >= 0 ? years[readoutI] : years[years.length - 1];

  // Labelled endpoints — first/last finite year.
  const firstI = m.findIndex((v) => v != null);
  const lastI = m.length - 1 - [...m].reverse().findIndex((v) => v != null);

  // YoY strip geometry — bars centred on a zero line, scaled to the max |YoY|.
  const y = clean(yoy);
  const yFinite = y.filter((v) => v != null).map((v) => Math.abs(v));
  const yMax = yFinite.length ? Math.max(1, ...yFinite) : 1;
  const SH = 22, SMID = SH / 2;
  const barW = Math.max(3, ((W - 2 * PADX) / n) * 0.62);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    setHoverI(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  };

  return (
    <div className="dt-trend" onMouseLeave={() => setHoverI(-1)}>
      <div className="dt-trend-head">
        <span className="dt-trend-label">{label}</span>
        <span className="dt-trend-readout">{readoutYear} · {fmt(readoutV)}</span>
      </div>

      <svg
        className="dt-trend-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}, ${yearSpan}`}
        onMouseMove={onMove}
      >
        <line x1={PADX} y1={H - PADB} x2={W - PADX} y2={H - PADB} stroke="var(--pa-hair)" vectorEffect="non-scaling-stroke" />
        {envPoly && <polygon points={envPoly} fill="var(--pa-up)" opacity="0.12" />}
        {c && (
          <polyline points={linePts(c)} fill="none" stroke="var(--city)" strokeWidth="1.3"
                    strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
        <polyline points={linePts(m)} fill="none" stroke="var(--pa-up)" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {activeOk && (
          <line x1={xAt(activeIndex)} y1={PADT} x2={xAt(activeIndex)} y2={H - PADB}
                stroke="var(--pa-sel)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        )}
        {hoverI >= 0 && m[hoverI] != null && (
          <circle cx={xAt(hoverI)} cy={yAt(m[hoverI])} r="2.6" fill="var(--pa-up)" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      <div className="dt-trend-ends">
        <span>{years[firstI]} · {fmt(m[firstI])}</span>
        <span>{years[lastI]} · {fmt(m[lastI])}</span>
      </div>

      {c && (
        <div className="dt-trend-leg">
          <span><i className="dt-sw" style={{ background: "var(--pa-up)" }} />{scopeName ?? "selection"}</span>
          <span><i className="dt-sw" style={{ background: "var(--city)" }} />{cityName}</span>
          {envelope && <span><i className="dt-sw dt-sw--band" />min–max</span>}
        </div>
      )}

      <div className="dt-trend-yoy">
        <span className="dt-trend-sub">YoY · Matched</span>
        <svg viewBox={`0 0 ${W} ${SH}`} preserveAspectRatio="none" className="dt-trend-yoy-svg"
             role="img" aria-label="Year-over-year change, matched sample">
          <line x1="0" y1={SMID} x2={W} y2={SMID} stroke="var(--pa-hair)" vectorEffect="non-scaling-stroke" />
          {y.map((v, i) => {
            if (v == null) return null;
            const h = (Math.abs(v) / yMax) * (SMID - 1);
            const up = v >= 0;
            return (
              <rect key={i} x={xAt(i) - barW / 2} y={up ? SMID - h : SMID} width={barW} height={h}
                    fill={up ? "var(--pa-up)" : "var(--pa-dn)"} />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
