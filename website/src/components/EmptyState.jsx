// =============================================================================
// EmptyState.jsx
//
// Generic "no data for this selection" panel. Section files pass in copy.
// Sized via CSS to absolute-fill .canvas-wrap so it sits where the map
// would otherwise be — keeps the side-panel controls and the ≡ toggle
// alive while the user is in a no-data state.
//
// Two slots: a one-line title (the headline) and a body paragraph
// (the "why" / what to do next). Sections compute appropriate copy from
// their data-source map — see dataSources.js / describeEmpty().
// =============================================================================

export default function EmptyState({ title, body }) {
  return (
    <div className="canvas-empty" role="status" aria-live="polite">
      <div className="canvas-empty-card">
        <h2>{title}</h2>
        {body && <p>{body}</p>}
      </div>
    </div>
  );
}
