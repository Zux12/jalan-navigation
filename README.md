# Jalan V4.4.3 — Road Inspection Fallback

This release retains all files from V4.4.2. Upload the entire project to the GitHub repository root, replacing existing files.

## Changes
- One small Overpass GET query for three route samples, with a 10-second timeout.
- If Overpass fails or does not match a sample, use TomTom Reverse Geocoding (requires your existing key in the Jalan TomTom settings).
- Distinguish **OSM mapped road tags** from **TomTom nearby-address approximations**.
- Unknown speed limits, direction and road types remain explicitly unknown for TomTom fallback.
- Cancellation, cache, and final status preserved.
- Heading and JavaScript cache version updated to V4.4.3.

## Test
1. Set your TomTom API key in Jalan's TomTom panel.
2. Calculate a Putrajaya–KLCC route.
3. Click Inspect selected route and wait for a final result.
4. Check the source label for each sample: OSM or TomTom fallback.
5. If the result is TomTom fallback, road names are approximate; speed limits must remain Unknown.
6. Check cancellation, clearing, routing, and iPhone layout.

This is a development test, not an authoritative speed-limit source. TomTom reverse geocoding returns nearby addresses, not guaranteed carriageway-level matches. Public Overpass servers have usage limits. The API key stays in the browser; do not commit it to GitHub.
