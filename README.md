# Jalan V3.2 — Waze Both-Point URL Test

## Deploy
Replace index.html, style.css and app.js in the root of zux12/jalan-navigation on GitHub Pages. Commit and hard-refresh.

## What changed
- **Test both points in Waze** constructs an *experimental* Waze Live Map URL using the same `from=ll.latitude,longitude` and `to=ll.latitude,longitude` format seen in the user's screenshot.
- **Open destination only (official)** retains the supported Waze deep-link fallback.
- All existing Jalan map, routes, GPS, reporting and mobile layout remain intact.
- Cache-busting query strings updated to V3.2.

## Test
1. Open Jalan on your Mac; select a starting location and destination (e.g., Suria KLCC).
2. Click **Test both points in Waze**.
3. Confirm whether Waze populated *both* fields correctly and whether it calculated routes automatically or required clicking **Leave now**.
4. If it fails, try the **Open destination only (official)** fallback.
5. On iPhone, prefer the official link if the experimental Live Map URL does not behave correctly.

**Important:** Waze Live Map's both-point URL is an observed, undocumented URL pattern, not an official public routing API. It may stop working or behave differently across browsers. It does not return route data or traffic to Jalan. This prototype does not scrape Waze. OpenStreetMap/Nominatim/OSRM demo services are for low-volume testing only.
