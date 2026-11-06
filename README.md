# Jalan V3 — Waze comparison prototype

Upload `index.html`, `style.css`, and `app.js` to the root of your existing GitHub Pages repository, replacing the previous versions.

Keeps all V2.3 features. Adds a **Compare in Waze Live Map** button (opens Waze in a separate tab) and **Copy route coordinates** for manual side-by-side comparisons. No Google Cloud project or API key required.

**Important:** This version does **not** embed Waze traffic on OpenStreetMap, automate Waze, or obtain Waze incident feeds. The Waze web page may differ from the mobile app. Waze's published partner data feed requires permission before reuse.

Test: (1) refresh to locate, (2) search KLCC and select it, (3) confirm route fits screen, (4) expand panel and click Compare in Waze, (5) compare manually, (6) test on iPhone.

Uses public OSM/Nominatim/OSRM demo endpoints with their usage limits; not for production or safety-critical driving.
