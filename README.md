# Jalan Navigation V4.2 — Road Speed Intelligence (local test)

Upload all `.html`, `.css`, and `.js` files to the root of your existing GitHub Pages repository. Keep `example-traffic.geojson` if desired.

## Test
1. Search for a destination and calculate a TomTom or OSRM route.
2. Open **V4.2 — Road Speed Intelligence** and click **Run multi-driver demo**. The route's first short segments show synthetic green/orange/red/gray classifications.
3. Change speed limit, normal speed, observed speed, driver count and slowdown duration; choose a route segment and click **Add observation**.
4. Test the 1–2 driver case (insufficient evidence), then 3+ drivers for 2+ minutes.
5. Optionally opt in to local GPS speed sampling while stationary or as a passenger. Stop sampling afterward.

## Scope and privacy
- No shared backend; no actual crowdsourcing between users.
- GPS speed samples are displayed locally and are not saved or transmitted by this new module. Existing TomTom and other features retain their own network behavior.
- The demo uses synthetic observations. No actual speed limits are automatically sourced yet; input manually for testing.
- Colored overlay is experimental and not suitable for navigation decisions.
- A future shared system needs consent, road/direction map matching, aggregation, anti-spoofing, retention controls, and real-world validation.
