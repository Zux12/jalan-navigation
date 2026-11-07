# Jalan Navigation V4.4 — Automatic Road Intelligence

Built from the tested V4.3 prototype. Upload all HTML/CSS/JS files to the **root** of the existing GitHub Pages repository.

## New capability

**Inspect selected route** samples three positions (20%, 50%, 80%) along the current route and requests nearby road tags from OpenStreetMap via a public Overpass API endpoint. It displays the mapped road name, highway class, explicit `maxspeed` tag (or **Unknown**), `oneway` tag, and approximate map-match distance. Small teal dots identify the matched positions. **Clear road inspection** removes these dots.

This is an **on-demand experiment**; do not repeatedly click it or use it at scale against the public Overpass server. Public endpoint availability, browser CORS, and rate limits may prevent some requests. No automatic retries are performed. Production deployment needs an appropriately hosted/contracted road-data service or a self-hosted extract.

## Important limits

- OSM `maxspeed` may be missing, stale, conditional, or in non-km/h units. This prototype displays the raw tag; it does not interpret complex legal speed rules.
- Nearest mapped way is not necessarily the road actually driven, particularly at flyovers, parallel roads and junctions. A match is **not** a verified speed limit or route assignment.
- Historical normal speed cannot be inferred from speed limits; the existing speed intelligence panel remains a manual/synthetic baseline.
- No location histories or user GPS observations are uploaded by this feature. The **route sample coordinates** are sent to the OSM Overpass service when you click Inspect, so avoid using it if that disclosure is undesirable.
- No Heroku or MongoDB required.

## Test

1. Calculate a route in Jalan, e.g. Putrajaya to KLCC.
2. Click **Inspect selected route**. Confirm three road samples and teal markers appear, or observe a clear service error.
3. Confirm road names/classes, and `Unknown` for untagged speed limits.
4. Click **Clear road inspection**; teal markers disappear.
5. Confirm GPS route lock, TomTom traffic, simulation, Waze comparison and iPhone layout still work.

This is not road-ready navigation; test while stationary.
