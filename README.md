# Jalan V3.7 — Stationary Navigation Simulation

Based on working V3.6, with the new `navigation-sim.js` file and updated HTML, CSS and app.js.

## Deploy
Upload all root-level files to the existing GitHub Pages repository. Keep filenames unchanged. Hard refresh.

## Test
1. Search a destination and select a TomTom or OSRM route.
2. Expand route details and click **Simulate navigation**.
3. Confirm the simulated position advances along the blue route, and remaining ETA, distance and arrival time change.
4. Pause, resume, restart, recenter, exit. Try iPhone portrait and landscape.
5. Test route changes, clear route and traffic layer after exiting.

## Limitations
This is a **stationary-only route playback**. It does not use live GPS for turn guidance, does not automatically reroute, and must not be used while driving. ETA decreases proportionally with simulated route progress; it is not a live recalculated traffic ETA. TomTom's existing normalized instruction data lacks maneuver coordinates, so the simulator intentionally shows general route guidance rather than invented turn distances. Browser tab backgrounding pauses playback. Existing 'Follow my location' is not turn-by-turn guidance.

Use only with appropriate map and traffic provider licenses, and protect your TomTom API key. If your previous key appeared in a screenshot, rotate it.
