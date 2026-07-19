import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// `base` is the public path the built site is served under. Default '/' means the
// site lives at the host root — today's Cloudflare Pages deploy. Set VITE_BASE_PATH
// (e.g. "/realestate/", with leading AND trailing slash) to deploy under a subpath.
//
// One knob, no drift: Vite mirrors `base` into import.meta.env.BASE_URL, and the
// router reads that as its <BrowserRouter basename> (see src/main.jsx) — so the
// build base and the in-app routing base can never disagree.
//
// Read from process.env (the build environment) rather than a .env file, since
// .env is gitignored; a host sets VITE_BASE_PATH as a build variable.
//
// CAVEAT: runtime asset fetches (/data, /styles, /downloads, /manifest.json) are
// root-absolute string literals that Vite's `base` does NOT rewrite, so a non-'/'
// base is not yet a complete subpath deploy — see README "Environment variables".
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: a change to our own code shouldn't re-hash (and
        // force re-download of) libraries that never changed. Only the boot-needed
        // core (React) and MapLibre are split by hand. MapLibre is imported only by
        // the code-split map sections (see main.jsx), so `vendor-maplibre` is fetched
        // ONLY when a map route opens — it never touches the home/read-page boot.
        // Map-only libs (@tanstack/react-table, polylabel) are deliberately left to
        // Rollup, which keeps them inside the lazy map chunks rather than a
        // boot-loaded vendor bundle.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('maplibre-gl')) return 'vendor-maplibre'
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'vendor-react'
        },
      },
    },
  },
})
