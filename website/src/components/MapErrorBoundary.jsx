// =============================================================================
// MapErrorBoundary.jsx
//
// Catches errors thrown while rendering its children (e.g. MapView failing to
// initialise WebGL / MapLibre) so one map failure shows an inline message
// instead of blanking the whole page. Wrap every MapView mount in one.
//
// Reset behaviour: give the boundary a key tied to the data URL — React
// remounts it (clearing the caught error) when the key changes, so a stale
// error from one (city, year) doesn't persist after switching to another.
// The Retry button clears the error in place for a transient failure.
//
// Must be a class component: error boundaries have no hook equivalent
// (getDerivedStateFromError / componentDidCatch are class-only).
// =============================================================================

import { Component } from "react";

export default class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  // Per-selection reset WITHOUT a remount: when resetKey changes (e.g. the year
  // swap's url), clear a caught error so the children re-render. This replaces
  // the old `key={url}` remount, which the in-place year-swap path removed.
  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="map-error">
          <p>The map could not load.</p>
          <p><small>{this.state.error.message}</small></p>
          {/* setState (not direct mutation) so React re-renders and retries
              the children — a direct `this.state.error = null` would not. */}
          <button onClick={() => this.setState({ error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
