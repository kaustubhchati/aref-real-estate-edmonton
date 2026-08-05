# nginx configuration for the Open Data Centre for Alberta Urban Real Estate

**For:** the server administrator setting up `realestatedata.srv.ualberta.ca`
**From:** the site's maintainers, Department of Economics, University of Alberta
**Contains:** `aref-realestate.conf`, plus two optional snippets in `optional/`

---

## What this site is

A plain static website. It is a folder of files — HTML, CSS, JavaScript, and a
large collection of map-data files in GeoJSON and CSV format. It replaces a
WordPress site.

There is **no application server, no database, no PHP and no Node.js**. The maps
are drawn in the visitor's browser. nginx's only job is to read files from disk
and send them, so there is nothing on the server to patch, restart or monitor
beyond nginx itself.

**Size:** about 227 MB, roughly 150 files. It grows by about 10 MB a year, when a
new year of data is added. Please allow around 300 MB, which leaves room for the
compressed copies described below.

**Updates:** we replace the files roughly quarterly, from our own machine. A
refresh rewrites existing files; it does not usually add new ones.

---

## Installing it

1. **Put the config where your distribution expects it.**

   | Distribution | Path |
   |---|---|
   | Debian / Ubuntu | `/etc/nginx/sites-available/aref-realestate.conf`, then symlink into `sites-enabled/` |
   | RHEL / Rocky / Alma | `/etc/nginx/conf.d/aref-realestate.conf` |

   Please **do not** replace your own `/etc/nginx/nginx.conf`. Our file is a
   single `server` block meant to sit alongside it. Worker counts, log paths and
   every other global setting remain entirely yours.

2. **Fill in three placeholders.** Each is marked `« CHANGE ME »` in the file:
   the hostname (twice) and the two TLS certificate paths.

3. **Create the document root** and tell us where it is, so we can deploy to it.
   The config expects `/var/www/aref/current`; any path is fine if you change
   that one line.

4. **Test and reload.**

   ```
   nginx -t && systemctl reload nginx
   ```

That is the whole installation. Steps 5 and 6 below are optional performance
improvements — the site works correctly without them.

---

## Optional: serving the pre-compressed copies

This is the one part worth a minute of your attention, because it is where
nearly all the bandwidth saving is.

Our build step writes a compressed copy of each text file next to the original —
`data.geojson.gz` beside `data.geojson`. Compression is done once on our
machine, not per request, so nginx can hand out a ready-made copy at no CPU
cost. For this site that is **227 MB of files becoming about 33 MB** with gzip,
or **about 19 MB** with Brotli.

To turn this on, copy the snippets you can support into `/etc/nginx/aref-optional/`:

```
mkdir -p /etc/nginx/aref-optional
cp optional/10-gzip-static.conf   /etc/nginx/aref-optional/    # usually available
cp optional/20-brotli-static.conf /etc/nginx/aref-optional/    # only if packaged
nginx -t
```

If `nginx -t` reports `unknown directive`, that module is not present on this
machine — **delete that one file and carry on**. Nothing else needs changing.

- **gzip** needs `ngx_http_gzip_static_module`. Check with
  `nginx -V 2>&1 | tr ' ' '\n' | grep http_gzip_static_module`. Most
  distribution packages include it.
- **Brotli** needs the third-party `ngx_brotli` module, e.g.
  `apt install libnginx-mod-brotli` on Debian/Ubuntu. **If it is not packaged
  for your platform, please skip it.** We would much rather do without Brotli
  than have you build nginx from source, which would cut this machine off from
  your normal security updates. That is a poor trade for a file-size gain.

**Why this is an include directory rather than two lines in the main config.**
Writing `brotli_static on;` on a machine without that module makes nginx refuse
to start — it aborts with `unknown directive`, which would take down every site
on the machine, not just ours. A wildcard include that matches no files is
silently ignored, so this arrangement cannot prevent nginx starting no matter
what is or is not installed. We have tested this directly, including with the
directory absent altogether.

**One caveat worth knowing:** a passing `nginx -t` does *not* prove the snippets
were picked up, because an include matching nothing also passes. To confirm
Brotli or gzip is actually active:

```
curl -sI -H 'Accept-Encoding: gzip' https://YOUR-HOST/data/zoning/zoning_bylaw.geojson | grep -i content-encoding
```

A `Content-Encoding: gzip` line means it is working.

---

## Things in the config you may wonder about

**A file-type mapping for `.geojson` and `.csv`.** Stock nginx has no entry for
either, so it sends them as anonymous binary downloads and skips compressing
them. We set the correct types (`application/geo+json`, `text/csv`) inside two
small blocks scoped to those extensions only, so no other file type on the
machine is affected.

**`gzip_proxied any`.** nginx's default is to skip compression entirely for
requests that arrive through a proxy. If this site ever sits behind a campus
reverse proxy or CDN, the default would silently disable all compression. This
setting prevents that.

**Missing data files return 404, deliberately.** A common shortcut for
browser-routed sites is to serve the home page for anything not found. We
explicitly do *not* do that for `/data/`, `/downloads/` or any data file: a
missing file returns a clean 404. If it returned the home page with a success
code instead, the browser would report a confusing parse error rather than an
obvious missing file, and a partial update could go unnoticed.

**Symlinks.** Our deploy publishes each update into a timestamped directory and
then re-points `current` at it, so visitors always see one complete version and
never a half-copied mix. This needs nginx's `disable_symlinks` left at its
default (`off`). It is the only setting that would break us; everything else is
yours to tune.

**HTTP/2 is not enabled.** The directive that turns it on was renamed in nginx
1.25 and we did not want to guess your version. If you would like it on, add
whichever form your nginx accepts — it is a straightforward improvement and
nothing else needs to change.

**Caching.** Three rules, by how each kind of file is versioned. The JavaScript
bundle has a content fingerprint in each filename, so it is cached for a year.
The data files keep their names and change contents, so they are cached but
re-checked. The entry page is always re-checked, because it names the
fingerprinted files. This means a returning visitor re-downloads only what
actually changed.

---

## If you would rather apply your own standards

That is genuinely fine. Only three things actually matter to us, and they can be
achieved however you prefer:

1. Addresses that are not files on disk should serve `/index.html` with a **200**
   status — *except* under `/data/` and `/downloads/`, which must return **404**
   when the file is absent.
2. `.geojson` should be served as `application/geo+json` and `.csv` as
   `text/csv`, and both should be compressed. Without a type mapping, most
   default compression lists skip them — and they are 96% of the site.
3. The `/assets/` folder can be cached indefinitely; everything else should be
   re-checked rather than pinned.

---

## A note on paths

The paths above are for Linux. We developed and tested this config on macOS,
where nginx lives under `/opt/homebrew/etc/nginx/` instead of `/etc/nginx/`; if
anything in our notes shows a Homebrew path, the Linux equivalent is the
`/etc/nginx/` one. The config file itself contains no macOS paths.

---

## What we tested, and what we could not

Verified against nginx 1.31.3 serving the real site, with `curl`: correct file
types, precompressed serving with `Content-Encoding` and `Vary`, uncompressed
delivery byte-identical to disk for clients that do not accept compression,
404 behaviour for missing data files, `304 Not Modified` on revalidation,
hidden files refused, and — with the optional directory removed entirely —
nginx starting cleanly and serving correctly.

We could **not** test Brotli: the module is not available on our development
machine, and it is not part of nginx. The snippet is written to your
documentation and is safe by construction, but it is the one piece that has not
been run. If you enable it, the `curl` check above will confirm it.

Please tell us the document root and, if there is a staging address first, its
exact URL — the site has to be built for the path it is served from.
