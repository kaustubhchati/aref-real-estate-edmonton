# Sidebar patterns

## Pattern A — metrics focus (choropleth, many controls)
Used by: PropertyAssessmentMap
Controls: city toggle, year select, metric select, neighbourhood search,
legend gradient bar, sb-ref.
Gel treatment: selects, city toggle active pill.
When to use: sections with city + year + metric selectors and a colour
scale legend. Multiple user choices drive the map state.

## Pattern B — stat panel (choropleth, hover feedback)
Used by: PermitChoroplethMap, BusinessCensusMap
Controls: year select, metric select, legend gradient bar, live hover
stat panel, sb-ref.
Gel treatment: selects.
Hover panel: updates on mousemove over fill layer, clears on mouseleave.
Shows neighbourhood name, district, and metric values for current metric.
When to use: choropleth sections where users scan many neighbourhoods.
The stat panel replaces casual popup reads without removing click-to-pin.

## Pattern C — minimal (point map, filter controls)
Used by: BuildingPermitsMap
Controls: year select, permit type chips, construction value tier cards,
coverage warning, source ref.
Gel treatment: year select, active chip, active tier cards.
No hover stat panel (point map — hover is on dots not polygons).
When to use: PMTiles point maps where the legend is visual (dot size/
colour) not a gradient bar, and filtering is the primary sidebar job.

## Pattern D — filter chips (amenity point/line layers) — STAGED
Not yet built. For use when Amenities sections ship.
Controls: layer visibility chips (tap to show/hide), route/type filter
segmented toggle, coverage radius slider, stats summary, source ref.
When to use: sections showing multiple point or line layers (bus stops +
LRT + bike routes) where the user controls layer visibility rather than
a choropleth metric.
Implementation notes:
- Each chip carries the layer colour as background tint
- Radius slider drives a MapLibre setFilter or a client-side buffer
- No legend gradient bar — point layers use symbol/colour legend instead
- One chip per data source (ETS stops, LRT stations, LRT lines, etc.)
