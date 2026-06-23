// =============================================================================
// SectionErrorBoundary.jsx
//
// Catches any error thrown while rendering a routed SECTION so one section's
// failure renders a graceful in-place fallback instead of unmounting the whole
// app (a blank white page that takes the Header/Nav/Footer down with it).
//
// Placed around <Outlet/> in Layout, keyed by route path: the chrome/nav live
// OUTSIDE this boundary so they always survive, and navigating to another
// section remounts the boundary (clearing the error) so the user recovers.
//
// Complements MapErrorBoundary, which wraps only <MapView> with map-specific
// retry copy (a WebGL/MapLibre init failure). This one is the section-wide net:
// it catches a throw ANYWHERE in a section that MapErrorBoundary doesn't wrap —
// the sidebar, the Legend, derived render-time computations, a hook. That gap
// (the only boundary wrapping just MapView) is why a sidebar/legend throw used
// to blank the whole page.
//
// Class component because error boundaries have no hook equivalent
// (getDerivedStateFromError / componentDidCatch are class-only).
// =============================================================================

import { Component } from "react";

export default class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface honestly for debugging (CLAUDE.md §6). The nav still works, so
    // the user always has a way out even though this view failed.
    console.error("[SectionErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="section-error">
          <h2>This view couldn’t load.</h2>
          <p>
            Something went wrong rendering this section. The rest of the site
            still works — use the navigation above to continue, or try again.
          </p>
          <p><small>{this.state.error.message}</small></p>
          {/* setState (not mutation) so React re-renders and retries children. */}
          <button onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
