# Jalan Navigation V3.9 — Turn guidance experiment

GitHub Pages: upload all HTML/CSS/JS files to the repository root. Keep your TomTom key out of GitHub. Refresh with Cmd+Shift+R.

## New
- Experimental next-turn guidance from available OSRM/TomTom maneuver coordinates.
- Voice prompts in GPS mode and simulation, controlled by Voice buttons (browser speech synthesis; requires supported browser).
- GPS off-route detection requiring 4 sufficiently accurate readings, then optional automatic traffic-aware rerouting if TomTom primary routing is enabled. Otherwise OSRM fallback is used.
- A 2-minute automatic reroute cooldown to limit repeat requests.
- Retains V3.8 traffic, comparison, simulation, GPS and incident reports.

## Test sequence
1. Connect TomTom, search a destination, verify traffic-aware route.
2. Start simulation, enable Voice and check turn prompt near a maneuver; if no turn coordinates were returned, guidance should say continue instead of inventing a turn.
3. Start GPS while stationary, enable Voice if desired, inspect accuracy and distance to next turn.
4. Enable Auto reroute, test manual reroute from a passenger position; avoid manufacturing GPS errors or driving while operating the app.
5. Verify exit, Waze comparison, traffic incidents and mobile layouts.

## Limitations
This is a research prototype, not a road-safe navigation app. GPS can drift or pause when Safari is backgrounded. Arrival and remaining ETA use proportional route progress, not continuous traffic recalculation. Automatic rerouting is triggered by off-route readings, **not** by continuous discovery of faster alternatives while on route. TomTom route maneuvers depend on returned guidance data; speech can be unavailable or delayed. Free public OSM/Nominatim/OSRM services are not intended for production traffic. Check TomTom licensing for mixed map display. Rotate any previously exposed API keys.
