// =============================================================================
// useInView.js
//
// Shared IntersectionObserver hook for the home feature-demo tiles: returns
// [ref, inView] so a tile plays its loop ONLY while (near) on screen and pauses
// off-screen. Lives in its own file so FeatureDemo + SliderDemo can share it
// without tripping react-refresh's "a file should only export components" rule.
// =============================================================================

import { useEffect, useRef, useState } from "react";

export function useInView(threshold = 0.35) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    // No observer (old browser / SSR) → just play; correctness over cleverness.
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView];
}
