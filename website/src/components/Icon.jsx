// =============================================================================
// Icon.jsx
//
// Inline SVG icons — the Tabler "outline" glyphs the read pages + shell use.
// SELF-HOSTED: every glyph's path data lives here as plain strings, so a page
// never fetches a webfont or a CDN at runtime (FOIP — no third-party request).
// Each glyph is drawn in Tabler's shared 24x24 stroke frame, in currentColor, so
// an icon takes the text colour of wherever it sits.
//
//   <Icon name="map-pin" />                 // 20px, decorative (aria-hidden)
//   <Icon name="chevron-down" size={16} />
//   <Icon name="brand-x" title="X" />       // labelled (role="img" + <title>)
//
// Add an icon: paste its Tabler outline <path d="..."> value(s) into ICONS,
// dropping Tabler's bounding-box path. Source: @tabler/icons 3.7.0 (MIT license).
// =============================================================================

// name -> the glyph's path "d" strings. Stroke width / caps / join + colour are
// set ONCE on the <svg> below and inherited by every path (Tabler outline style).
const ICONS = {
  "arrow-right": ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"],
  "brand-facebook": ["M7 10v4h3v7h4v-7h3l1 -4h-4v-2a1 1 0 0 1 1 -1h3v-4h-3a5 5 0 0 0 -5 5v2h-3"],
  "brand-instagram": ["M4 4m0 4a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z", "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M16.5 7.5l0 .01"],
  "brand-x": ["M4 4l11.733 16h4.267l-11.733 -16z", "M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"],
  "brand-youtube": ["M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-8z", "M10 9l5 3l-5 3z"],
  "briefcase": ["M3 7m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z", "M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2", "M12 12l0 .01", "M3 13a20 20 0 0 0 18 0"],
  "building-community": ["M8 9l5 5v7h-5v-4m0 4h-5v-7l5 -5m1 1v-6a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1v17h-8", "M13 7l0 .01", "M17 7l0 .01", "M17 11l0 .01", "M17 15l0 .01"],
  "chart-dots": ["M3 3v18h18", "M9 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M19 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M14 15m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M10.16 10.62l2.34 2.88", "M15.088 13.328l2.837 -4.586"],
  "check": ["M5 12l5 5l10 -10"],
  "chevron-down": ["M6 9l6 6l6 -6"],
  "download": ["M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2", "M7 11l5 5l5 -5", "M12 4l0 12"],
  "home-dollar": ["M19 10l-7 -7l-9 9h2v7a2 2 0 0 0 2 2h6", "M9 21v-6a2 2 0 0 1 2 -2h2c.387 0 .748 .11 1.054 .3", "M21 15h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5", "M19 21v1m0 -8v1"],
  "info-circle": ["M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "M12 9h.01", "M11 12h1v4h1"],
  "map-pin": ["M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0", "M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z"],
  "menu-2": ["M4 6l16 0", "M4 12l16 0", "M4 18l16 0"],
  "x": ["M18 6l-12 12", "M6 6l12 12"],
};

export default function Icon({ name, size = 20, title, className, ...rest }) {
  const paths = ICONS[name];
  if (!paths) {
    // Surface a typo loudly rather than rendering an invisible gap.
    console.warn(`Icon: unknown name "${name}"`);
    return null;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
