# Jalan Navigation V3.3 — Waze ETA Comparison

Upload index.html, style.css, app.js, and comparison.js to the ROOT of your existing GitHub Pages repository. Replace the first three files and ADD comparison.js. Commit, then hard refresh.

The original V3.2 map, search, routing, reporting, Waze two-point link, official fallback, and mobile layout are retained.

To test: calculate a Jalan route, expand Show route details, open Waze separately, and enter Waze's ETA and distance in the comparison panel. The Jalan fields automatically show the currently selected route. Save a comparison or export all saved comparisons to CSV. Use Load example to prefill Waze 70 minutes / 34 km; the Jalan 36-minute estimate is a historical example and is NOT substituted for the actual route estimate.

Comparison records are saved only to this browser's localStorage. They are not shared across devices. No Waze data is scraped or fetched. Waze's web links may behave differently across browsers. OSRM and Nominatim are public demo services subject to usage policies and not suitable for production-scale traffic.
