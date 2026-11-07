# Jalan Navigation V4.3 — Predictive GPS & Route Lock

Upload all website files into the root of your existing GitHub Pages repository, replacing older versions. New files: `predictive-gps.js` and `predictive-tests.js`.

## Changes
- Uses the selected route as the primary position reference while GPS is uncertain.
- A single implausible GPS jump does not relocate the navigation marker or trigger rerouting.
- Prediction uses elapsed time and speed, capped to 12 seconds per GPS gap.
- Sustained, plausible off-route readings (at least four spanning eight seconds) can confirm a deviation.
- Low-confidence fixes do not count toward arrival detection or journey GPS quality.
- Includes four synthetic tests in a new Predictive GPS panel.

## Testing
1. Calculate a route, open Predictive GPS panel and run GPS jump tests.
2. Confirm all four show PASS.
3. Start GPS test while stationary or as passenger; check route-matching status.
4. Verify simulation, TomTom routing, reports, Waze comparison and iPhone layout remain working.

## Limits
This is a heuristic prototype, not validated sensor fusion or inertial dead reckoning. It does not know road elevation or reliably distinguish every parallel road. Do not rely on it while driving. Background Safari GPS may pause. No live multi-user data is collected.
