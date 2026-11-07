# Jalan Navigation V3.5 — TomTom Live Traffic

Upload `index.html`, `style.css`, `app.js`, `comparison.js`, `traffic-test.js`, `tomtom-live.js` and optionally `example-traffic.geojson` to the root of `zux12/jalan-navigation`. Do not upload your API key.

## Test
1. Open Jalan on GitHub Pages, expand the panel and paste your TomTom key in V3.5 settings.
2. Click **Connect / Update traffic**. Road traffic tiles should appear. Zoom to Kuala Lumpur to test incidents.
3. Search for Suria KLCC and calculate Jalan route, then click **Get TomTom traffic-aware ETA**. Compare with Waze in separate tab.
4. Try **Hide live traffic** and **Forget key**.

## Important
- The key is kept in `sessionStorage` by default; optional Remember stores it in `localStorage` on that device. It is never written to the GitHub files. However it is still exposed in browser requests to TomTom and browser developer tools. Domain restrictions are necessary, but do not make it secret.
- Domain whitelisting may affect browser calls; if the service returns 403/401 or blocked tiles, review TomTom key permissions, allowed origins, CORS and quotas.
- Map tiles and incident requests use API quota. Live tiles refresh every five minutes; incidents reload after map moves.
- This demo uses OpenStreetMap tiles plus TomTom overlays. Confirm TomTom's current licensing and attribution requirements for this combination before public distribution.
- TomTom ETA is calculated independently; it does not replace Jalan's blue OSRM route. This is a prototype, not driving guidance.
- Public OSM/Nominatim/OSRM endpoints are for low-volume testing only.
