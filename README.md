# Jalan Navigation V4.5 — Congestion Boundary Detection

Upload all web files to the root of your existing GitHub Pages repository, replacing previous versions. Do not upload API keys.

## New feature

The **V4.5 — Congestion Boundary Detection** panel uses synthetic observations along the currently selected route. Choose a route longer than 2 km, select a scenario, and click **Run scenario**. Click **Next time step** to see the queue grow, shrink or clear. The colored geometry follows route coordinates and the queue tail/head are marked on the map.

The scenario sequence is *forming → growing → recovering → cleared*. **Insufficient driver evidence** is a separate test and must not confirm a queue. A minimum of three independent synthetic drivers and two minutes of slowdown is required for confirmation. Thresholds and 200-meter segments are illustrative, not validated for production.

## Test checklist

1. Existing TomTom routing, GPS and voice remain functional.
2. Forming scenario shows queue tail, queue head and approximate length.
3. Next time step grows the queue and labels the trend Growing.
4. Subsequent steps shrink and clear the queue.
5. Insufficient-driver scenario does not confirm congestion.
6. Colored segments follow road bends (selected route geometry).
7. Clear boundary overlay removes colored lines and markers.
8. iPhone portrait layout remains usable.

This feature does not collect, share, store or upload real user GPS data. It does not calculate actual traffic conditions. A backend, consent, independent-device validation and real-world calibration are required before crowdsourced traffic deployment.
