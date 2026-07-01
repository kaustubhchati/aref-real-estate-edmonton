// =============================================================================
// TrendChart.jsx
//
// The console's TIMESERIES slot (D3): a wide, short line chart of one entity's
// active-metric trajectory over the full year series — the selected neighbourhood
// (N=1), the selection mean (N≥2), or the citywide mean (N=0). It replaces the tiny
// per-row sparkline that used to live in the table (no duplication): the full trend
// as a real chart, in a fixed labeled slot.
//
// Wide-but-shallow shape reader, not a precision chart (the accepted consequence of
// the shallow console band): the line fills the slot (preserveAspectRatio="none",
// non-scaling stroke keeps it crisp), the active year is dotted, and the value RANGE
// (min…max) is labelled below so the y-scale is legible. Hand-rolled SVG, no
// dependency — same idiom as Sparkline/DistributionStrip.
//
// Props:
//   series      — active-metric value per year (null / -999 = gap; line skips it)
//   years       — the manifest year list (for the x-axis span label)
//   activeIndex — index of the active year within `years` (dotted)
//   fmt         — the metric's formatter (for the min/max value labels)
//   ariaLabel   — accessible description
// =============================================================================

export default function TrendChart({
  series,
  years = [],
  activeIndex = -1,
  fmt = (v) => v,
  ariaLabel = "Trend",
}) {
  const nums = (series ?? []).map((v) => (v == null || isNaN(+v) || +v === -999 ? null : +v));
  const finite = nums.filter((v) => v != null);
  const yearSpan = years.length ? `${years[0]}–${years[years.length - 1]}` : "";

  // A shape reader needs ≥2 points; below that the slot shows a calm empty note
  // (never collapses or throws) — same self-guard as Sparkline/DistributionStrip.
  if (finite.length < 2) {
    return <div className="dt-trend dt-trend--empty">No trend for this selection</div>;
  }

  const n = nums.length;
  const W = 280, H = 60, PAD = 3;
  const xAt = (i) => (n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD));
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const yAt = (v) => H - PAD - ((v - min) / span) * (H - 2 * PAD);

  const pts = [];
  nums.forEach((v, i) => { if (v != null) pts.push(`${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`); });
  const activeOk = activeIndex >= 0 && nums[activeIndex] != null;

  return (
    <div className="dt-trend">
      <svg
        className="dt-trend-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${ariaLabel}, ${yearSpan}, ${fmt(min)} to ${fmt(max)}`}
      >
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {activeOk && (
          <circle
            cx={xAt(activeIndex)} cy={yAt(nums[activeIndex])} r="3"
            fill="var(--accent-dark)" stroke="#fff" strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {/* value RANGE + year span — the y-scale the eye needs to read the shape */}
      <div className="dt-trend-ax">
        <span>{fmt(min)}</span>
        <span className="dt-trend-years">{yearSpan}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}
