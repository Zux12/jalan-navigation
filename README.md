# Jalan Navigation V3.4 — External Traffic Overlay Feasibility

This version preserves V3.3 features and adds a **local GeoJSON overlay experiment**. It does **not** retrieve Waze traffic data. The Waze comparison remains in a separate tab.

## GitHub Pages deployment
Upload `index.html`, `style.css`, `app.js`, `comparison.js`, and **new** `traffic-test.js` to the repository root. `example-traffic.geojson` is optional and is only a synthetic sample file. Do not upload real sensitive traffic datasets to a public repository.

## Test
1. Refresh Jalan and search for a destination to verify existing routing.
2. Expand route details and click **Show synthetic demo**. A red segment and an orange marker should appear. They are fictional and do not represent actual traffic.
3. Click **Clear overlay**.
4. Tick the permission checkbox, then import `example-traffic.geojson`. The sample should display.
5. Check the iPhone layout and V3.3 comparison / CSV export.

## Data format
GeoJSON FeatureCollection with up to 500 Point, LineString, or MultiLineString features, up to 1 MB. Properties may contain `label` and `severity` (`high`, `medium`, other). The file is read locally in the browser and is not sent to a server. This generic format is **not a claim of compatibility with any Waze API**.

## Limitations
Waze data access, permissions and feed format remain unresolved. This is not real-time navigation, a live traffic feed, or a commercial data integration. OSM public tiles, Nominatim and OSRM demo services have usage policies and are not production infrastructure.
