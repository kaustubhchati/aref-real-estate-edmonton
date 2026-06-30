// =============================================================================
// DistributionStrip.jsx
//
// A hand-rolled SVG strip plot — the SPREAD/SHAPE of a set of values on one axis,
// not just their centre. Used by the PA selection aggregate (D8 item 9): one tick
// per selected neighbourhood's ACTIVE-metric value, so a glance shows whether the
// selection is tight or wide, clustered or split, and where the outliers sit. The
// aggregate cards give the central figures; this gives the shape around them.
//
// Strip plot, not a histogram: one value per neighbourhood and a box-select can be
// small (n≥2), where binning few values misleads — a strip is honest at any n and
// mirrors the Sparkline idiom (thin SVG marks over a value range). Overlapping
// ticks build density via low opacity; the median is marked as an anchor.
//
// No dependency, no animation — calm, single accent — matching the shipped chrome.
// Reduced-motion is honoured BY CONSTRUCTION (nothing here animates or transitions).
// Renders nothing below 2 values (no spread to show; the cards already carry the
// central figures) — the same self-guarding pattern as Sparkline.
//
// Props:
//   values — finite numbers (already filtered to reportable; nulls excluded)
//   label  — active-metric label (caption + accessible name)
//   fmt    — the metric's formatter (end labels + a11y readout)
//   width/height — SVG box in px (viewBox units; the svg itself scales to 100%)
// =============================================================================

// Median of the shown values — the strip's own honest summary (a median of the
// per-neighbourhood values on the active metric; no parcel weighting is claimed).
function medianOf(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default function DistributionStrip({
  values,
  label = "Value",
  fmt = (v) => v,
  width = 280,
  height = 28,
}) {
  const finite = (values ?? []).filter((v) => v != null && Number.isFinite(+v)).map(Number);
  if (finite.length < 2) return null; // no spread to show

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const PAD = 3;
  // All-equal selection (e.g. tied year-built) has no range — centre every tick
  // rather than pile them at the left edge (mirrors Sparkline's single-point case).
  const xAt = (v) =>
    max === min ? width / 2 : PAD + ((v - min) / (max - min)) * (width - 2 * PAD);
  const med = medianOf(finite);

  // The strip stretches to the container width (preserveAspectRatio="none"); the
  // non-scaling-stroke keeps every tick a crisp 1.5px regardless of that x-scale.
  const a11y = `${label} distribution across ${finite.length} neighbourhoods, ${fmt(min)} to ${fmt(max)}, median ${fmt(med)}`;

  return (
    <div className="dt-dist">
      <div className="dt-dist-cap">
        <span>{label} spread</span>
        <span className="dt-dist-n">{finite.length} shown</span>
      </div>
      <svg
        className="dt-dist-svg"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={a11y}
      >
        {/* baseline axis */}
        <line x1={PAD} y1={height - 5} x2={width - PAD} y2={height - 5}
              stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {/* one tick per value — low opacity so overlaps read as density */}
        {finite.map((v, i) => {
          const x = xAt(v);
          return (
            <line key={i} x1={x} y1={4} x2={x} y2={height - 5}
                  stroke="var(--accent)" strokeWidth="1.5" strokeOpacity="0.45"
                  vectorEffect="non-scaling-stroke" />
          );
        })}
        {/* median anchor — the selection's middle within the spread (drawn last = on top) */}
        <line x1={xAt(med)} y1={2} x2={xAt(med)} y2={height - 3}
              stroke="var(--accent-dark)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="dt-dist-ends">
        <span>{fmt(min)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}
