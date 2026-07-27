# Amenity map glyphs — Maki (vendored, CC0)

The cream PNG glyphs the amenity maps draw on their point discs (the "glyph is a second data
channel" rule — DESIGN_SYSTEM §8 / CC directive 2026-07-27).

## Source & licence
- **Set:** [Maki](https://github.com/mapbox/maki) by Mapbox, **version 8.2.0**.
- **Licence:** **CC0 1.0 (public domain)** — no attribution required, commercial use allowed.
  Source SVGs fetched from `raw.githubusercontent.com/mapbox/maki/main/icons/<name>.svg`.
- Each Maki icon is a single-path SVG on a 15×15 grid, purpose-built for cartography.

## How these PNGs were made (reproducible)
Rasterised from the Maki SVGs at **64×64 px** and recoloured to a single **cream `#f7f1df`** (the
glyph is always cream; the disc under it carries the colour — so NO SDF, which has a small-size
sharpness penalty we don't need). Recolour = canvas `source-in` fill, which keeps the icon's own
transparency (the negative space / holes show the disc colour through). To regenerate: re-fetch the
SVGs and re-run the raster step (cream `#f7f1df`, `source-in`, 64 px).

## Icon → use
| PNG | Maki | Used by |
|---|---|---|
| `bus` | bus | Bus Stops (layer glyph) |
| `rail-light` | rail-light | LRT Stations (layer glyph) |
| `amusement-park` | amusement-park | Playgrounds (layer glyph; category on colour) — ferris wheel, reads clearer at map size than the slide-figure `playground` (KC 2026-07-27) |
| `charging-station` | charging-station | EV Charging (layer glyph; category = level on colour) |
| `swimming` | swimming | Spray Parks (layer glyph); Recreation Facilities → Outdoor Pool |
| `police` | police | Police Stations (layer glyph) |
| `pitch` | pitch | Track Sports Fields (layer glyph); Recreation Facilities → Staffed Sports Field |
| `stadium` | stadium | Recreation Facilities → Arena |
| `fitness-centre` | fitness-centre | Recreation Facilities → Recreation Centre |
| `park` | park | Recreation Facilities → City Park |
| `park-alt1` | park-alt1 | Recreation Facilities → River Valley Park |
| `tennis` | tennis | Recreation Facilities → Tennis Court |
| `golf` | golf | Recreation Facilities → Golf Course |
| `skiing` | skiing | Recreation Facilities → Snowshoeing (approximate — no snowshoe glyph) |
| `theatre` | theatre | Recreation Facilities → Arts Booking Facility |
| `art-gallery` | art-gallery | Recreation Facilities → Arts Program Facility |
