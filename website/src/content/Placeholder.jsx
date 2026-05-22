// =============================================================================
// Placeholder.jsx
//
// One shared "coming soon" page used by every nav route whose real content
// hasn't been ported yet (all maps + the report card tables, as of this
// commit). When a section is built, it gets its own folder under content/
// per CLAUDE.md §3 — at which point you remove the corresponding Placeholder
// route from main.jsx, not this file.
// =============================================================================

export default function Placeholder({ title, kind }) {
  return (
    <article className="content-placeholder">
      <h1>{title}</h1>
      <p className="content-placeholder-kind">[{kind}]</p>
      <p>
        This page is part of the navigable shell. The {kind} for{" "}
        <strong>{title}</strong> will be ported here when its pipeline section
        is built (CLAUDE.md §3).
      </p>
    </article>
  );
}
