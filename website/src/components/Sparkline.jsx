// =============================================================================
// Sparkline.jsx
//
// A tiny inline SVG trend line — hand-rolled, no dependency (at this data scale
// a charting lib isn't worth it). Used by the info rail (one metric across all
// years for the selected neighbourhood) and the data table (per-row trend).
//
// Props:
//   values      — array of numbers; null / NaN entries are GAPS (the line skips
//                 them and connects the finite points by index)
//   activeIndex — index to mark with a dot (e.g. the active year); -1 = none
//   width/height — SVG box in px
//   ariaLabel   — accessible description (it's an img role)
//
// Degenerate input (fewer than 2 finite points) renders a centred baseline so
// the cell never collapses or throws.
// =============================================================================

export default function Sparkline({
  values,
  activeIndex = -1,
  width = 104,
  height = 30,
  stroke = "var(--accent)",   // line colour (callers pass a trajectory colour)
  ariaLabel = "Trend",
}) {
  const nums = (values ?? []).map((v) => (v == null || isNaN(+v) ? null : +v));
  const finite = nums.filter((v) => v != null);
  const n = nums.length;

  // x by index (so gaps keep their horizontal position), y normalised to the box.
  const PAD = 2;
  const xAt = (i) => (n <= 1 ? width / 2 : PAD + (i / (n - 1)) * (width - 2 * PAD));

  if (finite.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline"
           role="img" aria-label={`${ariaLabel}: not enough data`}>
        <line x1={PAD} y1={height / 2} x2={width - PAD} y2={height / 2}
              stroke="var(--border)" strokeWidth="1" strokeDasharray="2 2" />
      </svg>
    );
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const yAt = (v) => height - PAD - ((v - min) / span) * (height - 2 * PAD);

  // Points for the finite values (skip gaps); a single polyline connects them.
  const pts = [];
  nums.forEach((v, i) => { if (v != null) pts.push(`${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`); });

  const activeOk = activeIndex >= 0 && nums[activeIndex] != null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
         role="img" aria-label={ariaLabel} className="sparkline">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {activeOk && (
        <circle cx={xAt(activeIndex)} cy={yAt(nums[activeIndex])} r="2.6"
                fill="var(--accent-dark)" stroke="#fff" strokeWidth="1" />
      )}
    </svg>
  );
}
