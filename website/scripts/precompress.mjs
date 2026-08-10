// =============================================================================
// precompress.mjs
//
// Post-build step for the nginx VM deploy: walk dist/ and write a Brotli (.br)
// and a gzip (.gz) sibling next to every compressible file, so nginx can hand
// back the already-compressed copy via `brotli_static` / `gzip_static` — zero
// per-request CPU, at the maximum ratio (Brotli quality 11) — instead of
// compressing on the fly. The biggest win is the map data: the per-year permit
// GeoJSON is multi-MB text that compresses ~5-8x.
//
// Why a plain node script and not a Vite plugin: node's built-in `zlib` does
// both Brotli and gzip, so this needs ZERO new dependencies — the site pulls in
// no third-party runtime OR build code it doesn't already have (see the FOIP
// note in README). Legible over clever: one synchronous walk, two compressors,
// a summary. Olivia can read it top to bottom.
//
// It only ADDS siblings — it never rewrites or deletes an original — so a host
// WITHOUT the _static modules (Cloudflare Pages, a plain file server) just keeps
// serving the plain file, unaffected. Run it with `npm run build:vm`
// (= `vite build && node scripts/precompress.mjs`); the default `npm run build`
// that Cloudflare Pages uses is deliberately left untouched (Pages compresses on
// its own, so the siblings would be wasted build time there).
// =============================================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

// dist/ sits beside this script's parent (website/). Resolve from the script's
// own location so it works no matter which cwd the npm script runs from.
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

// === What to compress ========================================================
// Allowlist by extension — only text-like assets benefit. Everything else is
// skipped: fonts (.woff2) and images (.png/.webp/.avif) are ALREADY compressed,
// so a sibling would be bigger and just waste build time.
const COMPRESSIBLE = new Set([
  ".js", ".mjs", ".css", ".html", ".json", ".geojson",
  ".csv", ".svg", ".txt", ".xml", ".webmanifest", ".map",
]);

// Below this, a sibling isn't worth it: the few bytes saved don't cover the
// compressed copy plus nginx's extra per-file stat on every request.
const MIN_BYTES = 1024;

// ...with one exception, by top-level directory. These two hold the payload the
// R pipeline publishes, and something always fetches it BY NAME: `downloads/` is
// what a user clicks, `data/` is what the maps, tables and manifests load. The
// floor above is a build-cost heuristic tuned for the bulk map payload, and it
// should not be the reason a served file is the one that ships uncompressed.
// Files under these directories are compressed at ANY size.
//
// `assets/` is deliberately NOT here. It is content-hashed bundler output — a
// changed file gets a new filename and is cached forever — and its sub-1 KB
// entries are exactly the boot chunks the floor was written for.
const ALWAYS_DIRS = new Set(["downloads", "data"]);

// Log each file at or above this as it compresses, so a multi-minute run over
// the big GeoJSON shows progress instead of looking hung.
const LOUD_BYTES = 2 * 1024 * 1024;

// === Compressors =============================================================
// Brotli quality 11 (max) with text mode + a size hint — the best ratio, paid
// once at build time. gzip level 9 is the fallback for the rare client that
// sends `Accept-Encoding: gzip` but not `br`.
const brotli = (buf) =>
  zlib.brotliCompressSync(buf, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
    },
  });
const gzip = (buf) => zlib.gzipSync(buf, { level: 9 });

// === Writing =================================================================

// Write one sibling, then stamp it with its SOURCE's timestamps.
//
// Why the stamp matters: nginx's gzip_static/brotli_static compare the sibling
// against the original when deciding whether the pre-made copy is safe to serve.
// A sibling that looks older than the file it came from is exactly what a stale
// copy looks like, and a quarterly refresh rewrites originals in place — same
// filename, new bytes — so the two can drift apart on a real deploy. Writing the
// stamp here, in the ONE function that writes a sibling, means a future edit
// cannot add a write that forgets it.
async function writeSibling(siblingPath, bytes, atime, mtime) {
  await fs.writeFile(siblingPath, bytes);
  await fs.utimes(siblingPath, atime, mtime);
}

// === Walk ====================================================================

// True when `file` sits anywhere under one of the ALWAYS_DIRS. We compare the
// FIRST path segment rather than searching the whole path, so a folder called
// "downloads" or "data" nested somewhere deeper can never match by accident.
function isAlwaysCompressed(file) {
  const [firstSegment] = path.relative(DIST, file).split(path.sep);
  return ALWAYS_DIRS.has(firstSegment);
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// === Run =====================================================================
async function main() {
  // Fail loudly if there's nothing to compress — a silent no-op would hide a
  // broken build behind a "done" message.
  try {
    await fs.access(DIST);
  } catch {
    console.error(`[precompress] no dist/ at ${DIST} — run \`vite build\` first.`);
    process.exit(1);
  }

  const kib = (n) => (n / 1024).toFixed(1);
  const mib = (n) => (n / 1024 / 1024).toFixed(1);
  const started = Date.now();
  let files = 0, skipped = 0, raw = 0, br = 0, gz = 0;

  for await (const file of walk(DIST)) {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".br" || ext === ".gz") continue;         // never re-compress our own output
    if (!COMPRESSIBLE.has(ext)) { skipped++; continue; }

    const buf = await fs.readFile(file);
    if (buf.length < MIN_BYTES && !isAlwaysCompressed(file)) { skipped++; continue; }

    const b = brotli(buf);
    const g = gzip(buf);

    // Read the source's timestamps BEFORE writing, so both siblings carry the
    // original's mtime rather than the moment the compressor happened to run.
    //
    // `bigint: true` asks for the raw NANOSECOND fields. The default stat hands
    // back JS Date objects, which are millisecond-only — stamping from those
    // leaves the sibling up to a millisecond off the source, which still reads as
    // a mismatch to anything comparing the two. Converting ns -> float seconds
    // for fs.utimes (which takes a Number) is accurate to ~16 ns in practice;
    // that is the floor, since fs.utimes has no nanosecond form.
    const st = await fs.stat(file, { bigint: true });
    const atime = Number(st.atimeNs) / 1e9;
    const mtime = Number(st.mtimeNs) / 1e9;

    // Keep a sibling only if it actually beats the original — an
    // already-dense file can compress LARGER, and serving that is a loss.
    if (b.length < buf.length) { await writeSibling(file + ".br", b, atime, mtime); br += b.length; }
    if (g.length < buf.length) { await writeSibling(file + ".gz", g, atime, mtime); gz += g.length; }

    files++;
    raw += buf.length;
    if (buf.length >= LOUD_BYTES) {
      const rel = path.relative(DIST, file);
      console.log(`  ${rel}  ${mib(buf.length)} MB → br ${kib(b.length)} KB (−${((1 - b.length / buf.length) * 100).toFixed(0)}%)`);
    }
  }

  const pct = (n) => (raw ? ((1 - n / raw) * 100).toFixed(1) : "0.0");
  console.log(
    `[precompress] ${files} files compressed, ${skipped} skipped, in ${((Date.now() - started) / 1000).toFixed(1)}s\n` +
    `  raw ${mib(raw)} MB  →  brotli ${mib(br)} MB (−${pct(br)}%)  ·  gzip ${mib(gz)} MB (−${pct(gz)}%)`
  );
}

main().catch((err) => { console.error("[precompress]", err); process.exit(1); });
