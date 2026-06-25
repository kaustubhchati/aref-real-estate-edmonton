// =============================================================================
// assetUrl.js
//
// The base-resolution seam: turn a root-absolute public path (e.g. "/data/x.json")
// into a URL that works under ANY deploy base.
//
// Vite serves the app under import.meta.env.BASE_URL — "/" by default (root
// deploy, today's Cloudflare Pages) and "/realestate/" when built with
// VITE_BASE_PATH (a subpath deploy; see vite.config.js + README). Vite rebases
// BUNDLED assets and the router for us, but NOT the runtime paths we fetch by
// hand — the data, downloads, manifest, and basemap-style URLs are plain strings
// it never sees. This is the one place those get the base applied, so a subpath
// deploy loads its data instead of 404ing at the host root.
//
// Default base "/" makes this a no-op: assetUrl("/data/x") === "/data/x", so the
// root deploy is byte-for-behaviour unchanged.
//
// Contract: `path` is root-absolute (starts with "/"). Pass the same literal you
// would have fetched directly; only WHERE it resolves from changes, not the path.
// =============================================================================

export function assetUrl(path) {
  // BASE_URL always ends in "/"; drop that trailing slash so it doesn't double
  // up with `path`'s leading slash. Base "/" -> "" -> path returned unchanged.
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return base + path;
}
