# Jalan Navigation V3.6 — TomTom traffic-aware routing

Upload `index.html`, `style.css`, `app.js`, `comparison.js`, `traffic-test.js`, and `tomtom-live.js` to the root of your existing GitHub Pages repository. Do not upload an API key. Optional example-traffic.geojson is synthetic.

## Test
1. Refresh GitHub Pages (hard refresh if needed), open route details, enter your new domain-restricted TomTom key, and press **Connect / Update traffic**.
2. Leave **Use TomTom as primary routing engine** checked. Search for Suria KLCC and select a destination result. The blue route should be TomTom's route with a traffic-aware ETA.
3. If TomTom returns alternatives, select a different route button. Not all journeys have alternatives.
4. Toggle incident display; incidents within approximately 1 km of the selected route should appear, if TomTom reports any.
5. Uncheck TomTom primary routing and search again to compare OSRM. The original navigation, Waze comparison and manual reports remain.
6. Check the iPhone layout and route visibility.

## Notes
- TomTom routes use live traffic and are fetched on demand; traffic tiles refresh every five minutes while the page is visible. Incident API is throttled to five minutes except after route changes. This is **not** continuous GPS-triggered rerouting.
- Public demo only, not a driving safety system. Real-time traffic and route alternatives depend on API access and data availability.
- TomTom key is stored in sessionStorage, or localStorage only when Remember is checked. Browser API requests reveal the key to TomTom; domain whitelisting and quotas are important.
- The previously shared key appeared in a screenshot. Rotate it in TomTom before continuing.
- Review TomTom traffic data licensing and OSM tile usage requirements before broad public use.
