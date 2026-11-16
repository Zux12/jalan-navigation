# Passenger vector map

Passenger Mode loads MapLibre GL JS 5.15.0 (pinned JS/CSS integrity) and the
OpenFreeMap Positron vector style. Its camera uses native pitch and bearing;
the old CSS perspective is only the basic-map fallback. Engineering Mode does
not load MapLibre. `?mode=passenger&renderer=raster` explicitly uses the fallback.

`passenger-vector-map.js` adapts the existing Leaflet 1.9.4 map instance. Leaflet
remains the logical owner of routes, reports, GPS markers and provider state.
The adapter mirrors visible polylines, markers and circle markers onto native
MapLibre layers/markers. Per-instance camera methods and layer setters preserve
their Leaflet return contracts. This boundary must be retested before upgrading
either mapping library. It does not alter the route or match coordinates.

The original TomTom flow TileLayer becomes a native raster source while the
vector renderer is active. Virtual Leaflet tile membership prevents duplicate
hidden raster requests. Off/key revocation removes the source; URL refreshes
replace its tiles; tile errors reach the existing traffic error handler. On
renderer failure, current tile layers are restored to Leaflet. No routing or
Incident Details endpoint changes are included.

Tiles are requested around the viewport by MapLibre, with a 96-tile cache cap
per source and pixel ratio capped at 2. The app does not download a country or
preload the complete journey. Labels, roads and traffic share the camera
projection. Building extrusion uses provider `render_height` metadata where
available; these are visualization heights and are not surveyed building or
road elevations. This does not provide lane-level positioning or resolve
opposite-carriageway incident filtering.

The map retains OpenFreeMap/OpenMapTiles/OpenStreetMap source attribution and
TomTom traffic attribution. OpenFreeMap needs no account or API key. Its public
service is an external availability dependency, so the existing raster map
stays available for failed loads, unsupported WebGL, or graphics context loss.

## Verification

- `node --test tests/*.test.js`: existing routing, privacy, traffic and GPS gates.
- `tests/public-desktop-390.cjs` and `tests/passenger-390.cjs`: existing renderer
  fallback and Engineering Mode regression tests, with external requests blocked.
- `tests/passenger-vector-390.cjs`: real MapLibre and software WebGL at 390px;
  mocked route/GPS, camera and arrow alignment, native drag, report focus,
  2D/3D toggle, traffic lifecycle, graphics fallback. Also loads the actual
  public basemap around public Kuala Lumpur fixture coordinates and captures
  mobile/desktop screenshots. No real user GPS or traffic key is used.

These browser checks do not substitute for physical iPhone Safari performance,
real traffic accuracy, independent road tests, or formal navigation readiness.
