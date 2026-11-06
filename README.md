# Jalan — Navigation Web Prototype

A simple GitHub Pages demo using Leaflet, OpenStreetMap tiles, and Nominatim destination search.

## Publish on GitHub Pages
1. Create a **public** GitHub repository (for example `jalan-navigation`).
2. Upload `index.html`, `style.css`, and `app.js` into the repository root.
3. Open **Settings → Pages → Build and deployment**.
4. Choose **Deploy from a branch**, `main`, `/ (root)`, then **Save**.
5. Open the Pages URL GitHub provides after deployment.

## What works
- Interactive OpenStreetMap map centered on Kuala Lumpur.
- Malaysian destination search (selecting a result places a marker; it does **not** calculate a route).
- Browser geolocation (requires HTTPS and permission).
- Accident, flood, hazard, and rain demo markers. Click a report type, then click the map. Reports persist **only in the current browser** via localStorage.

## Not yet included
- Route calculations, turn-by-turn directions, live traffic, user accounts, shared reports, rewards, and Waze integration.

## Usage notes
- Public OpenStreetMap tiles and Nominatim are community-operated resources with usage policies. This is for low-volume manual testing only, **not** production/high-traffic deployment. No autocomplete is used; searches only occur on submit. Do not bulk-query or scrape.
- Replace the public tile/search services with a suitable hosted provider before launching widely.
- This is not affiliated with Waze or Google.
