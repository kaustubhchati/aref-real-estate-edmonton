// =============================================================================
// Shield.jsx
//
// The University of Alberta shield lock-up, drawn inline as SVG (self-hosted, no
// image request). The shield BODY is `currentColor`, so it takes the colour of
// its context — white on the dark pearl header/footer bands. The inner "A" mark,
// cross-bar, and smile are the fixed brand green (#275d38), so the shield reads
// correctly on any background. Used by the Header and the Footer mark.
//
//   <Shield size={46} />                 // header lock-up
//   <Shield size={34} title="…" />       // footer mark
// =============================================================================

export default function Shield({ size = 44, title = "University of Alberta", className }) {
  return (
    <svg
      width={size}
      height={(52 * size) / 44}
      viewBox="0 0 44 52"
      role="img"
      aria-label={title}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Shield body — inherits the surrounding text colour (white on the bands) */}
      <path d="M2 2 H42 V30 C42 42 32 48 22 50 C12 48 2 42 2 30 Z" fill="currentColor" />
      {/* Brand-green "A", cross-bar, and smile (the mark colour is fixed) */}
      <path d="M22 9 L27 20 H17 Z" fill="#275d38" />
      <rect x="15" y="24" width="14" height="4" rx="1" fill="#275d38" />
      <path d="M14 32 C18 40 26 40 30 32" stroke="#275d38" strokeWidth="3.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
