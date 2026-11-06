# Jalan Navigation V3.1 — Waze Destination Deep Link

Upload `index.html`, `style.css`, and `app.js` into the root of the existing `zux12/jalan-navigation` GitHub Pages repository, replacing the prior files.

## Changes
- **Open destination in Waze** uses the official Waze URL scheme: `https://waze.com/ul?ll=LAT,LON&navigate=yes`.
- Select a destination from Jalan search results first. Waze will use its own origin/current location; the Jalan start location cannot be reliably passed using this link.
- Keeps the V3 map, routing, community reports, and copy-route comparison tools.
- Does not scrape, embed, or obtain Waze traffic data.

## Test
1. Open Jalan and search for KLCC, then select a result.
2. Expand route details and press **Open destination in Waze**.
3. Check Waze's destination. If Waze opens the iPhone app instead of Live Map, that is expected.
4. Confirm Waze's starting point before comparing ETA.

Note: Public OpenStreetMap/Nominatim/OSRM demo services are for low-volume testing, not production or safety-critical navigation.
