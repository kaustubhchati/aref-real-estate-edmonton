// =============================================================================
// PearlBand.jsx
//
// The "pearl" surface — a static iridescent conic sheen under a dark veil, with
// content composited on top. Used for the header + footer bands (variant="band")
// and the heroes (variant="hero"). The sheen is deliberately STATIC: it once
// rotated, but animating the gradient repainted every frame and stalled the map
// pages, so it was frozen (see index.css). The three inner layers are decorative
// — only .pearl__content is real content.
//
// MUST be rendered inside a `.brand` surface: the band colour + sheen read the
// bridge-palette tokens (--uofa-green-deep etc.).
//
//   <PearlBand variant="band"> … </PearlBand>
// =============================================================================

export default function PearlBand({ variant = "hero", className = "", children, ...rest }) {
  const cls = ["pearl", variant === "band" ? "pearl--band" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} {...rest}>
      <div className="pearl__sheen" aria-hidden="true" />
      <div className="pearl__veil" aria-hidden="true" />
      <div className="pearl__content">{children}</div>
    </div>
  );
}
