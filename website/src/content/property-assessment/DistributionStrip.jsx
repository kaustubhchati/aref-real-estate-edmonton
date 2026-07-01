// =============================================================================
// DistributionStrip.jsx
//
// The console's DISTRIBUTION slot (D3): a real HISTOGRAM of the CITYWIDE spread of
// the active metric, with a marker showing where the SELECTION sits within it — so a
// glance places the selected neighbourhood(s) against the whole city (low / typical /
// high, in the tail or the mode). Promoted from the earlier faint selection-only
// strip: the bars are the city; the marker(s) are the selection.
//
//   • bars    — the city distribution, binned (√n bins, clamped) over [min, max]
//   • markers — the selection's active-metric value(s): one line at N=1, a tick per
//               neighbourhood at N≥2 (low opacity = density) + a bold median anchor.
//               None at N=0 (the city histogram alone).
//
// Wide-but-shallow shape reader (the accepted consequence of the shallow band): hand-
// rolled SVG, no dependency, nothing animates (reduced-motion honoured by construction).
// Self-guards below 2 city values (no distribution to show).
//
// Props:
//   values  — the CITYWIDE active-metric values (nulls already excluded upstream ok)
//   markers — the SELECTION's active-metric values (0 → city only; 1 → single; ≥2 → set)
//   label   — active-metric label (accessible name)
//   fmt     — the metric's formatter (end labels + a11y readout)
// =============================================================================

function medianOf(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default function DistributionStrip({
  values,
  markers = [],
  label = "Value",
  fmt = (v) => v,
}) {
  const city = (values ?? []).filter((v) => v != null && Number.isFinite(+v)).map(Number);
  if (city.length < 2) return <div className="dt-hist dt-hist--empty">No distribution</div>;

  const min = Math.min(...city);
  const max = Math.max(...city);
  const span = max - min || 1;

  // √n bins (a standard rule), clamped to a legible range for the shallow slot.
  const nb = Math.min(24, Math.max(6, Math.round(Math.sqrt(city.length))));
  const counts = new Array(nb).fill(0);
  city.forEach((v) => {
    let b = Math.floor(((v - min) / span) * nb);
    if (b >= nb) b = nb - 1;
    if (b < 0) b = 0;
    counts[b] += 1;
  });
  const maxC = Math.max(...counts) || 1;

  const W = 280, H = 48, PAD = 2;
  const xAt = (v) => PAD + ((v - min) / span) * (W - 2 * PAD);

  const mk = (markers ?? []).filter((v) => v != null && Number.isFinite(+v)).map(Number);
  const med = mk.length ? medianOf(mk) : null;

  const a11y =
    `${label} distribution across ${city.length} neighbourhoods, ${fmt(min)} to ${fmt(max)}` +
    (mk.length ? `; selection of ${mk.length}, median ${fmt(med)}` : "");

  const binW = (W - 2 * PAD) / nb;
  return (
    <div className="dt-hist">
      <svg
        className="dt-hist-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={a11y}
      >
        {/* city bars */}
        {counts.map((c, i) => {
          const bh = (c / maxC) * (H - 3);
          return (
            <rect
              key={i}
              x={PAD + i * binW + 0.4}
              y={H - bh}
              width={Math.max(0.5, binW - 0.8)}
              height={bh}
              fill="var(--border)"
            />
          );
        })}
        {/* selection marker(s): a line per selected value (density via opacity) */}
        {mk.map((v, i) => (
          <line
            key={i}
            x1={xAt(v)} y1={0} x2={xAt(v)} y2={H}
            stroke="var(--accent)" strokeWidth="1.5"
            strokeOpacity={mk.length > 8 ? 0.4 : 0.85}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* selection median anchor (bold) when there's a set to summarise */}
        {mk.length >= 2 && (
          <line
            x1={xAt(med)} y1={0} x2={xAt(med)} y2={H}
            stroke="var(--accent-dark)" strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="dt-hist-ends">
        <span>{fmt(min)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}
