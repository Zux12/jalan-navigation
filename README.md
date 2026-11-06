# Jalan Navigation V2 — route-planning demo

Static HTML/CSS/JS site for GitHub Pages. No build step or API key.

## Deploy
Upload `index.html`, `style.css`, `app.js` to the root of your existing `zux12/jalan-navigation` repository and commit. GitHub Pages will deploy automatically. Refresh with Cmd+Shift+R.

## Test
1. Search for KLCC and select a result. Permit browser location access, or select "Choose on map" and click a starting location.
2. Check route line, distance, ETA, directions preview and alternative routes (where available).
3. Select another route; clear it; test reports, GPS and browser refresh.

## Important limitations
- Uses OpenStreetMap tiles, public Nominatim geocoding, and the public OSRM demo routing server. These are for light/manual testing only; their usage policies, rate limits and availability must be respected. Do not launch a production app on these public endpoints.
- No live traffic, Waze data, voice guidance, off-route detection or reliable turn-by-turn navigation. "Follow my location" only pans the map to the current GPS location.
- Route durations are estimates without live traffic. Driving routes can be wrong; don't rely on this prototype while driving.
- Reports are unverified and saved in browser localStorage only.
- Location requires HTTPS (GitHub Pages provides this) and permission.
- Search only targets Malaysia; Nominatim's public API must not be used for client-side autocomplete or high-volume requests.
- Map data © OpenStreetMap contributors.
