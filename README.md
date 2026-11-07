# Jalan Navigation V4.0 — Proactive Traffic Route Suggestions

Upload all project files to the root of the existing GitHub Pages repository. This version preserves V3.9 and adds `proactive-routing.js`.

## How to test
1. Enter your TomTom API key in Jalan settings, enable TomTom primary routing, and calculate a route.
2. On iPhone, while stationary or as a passenger, start **Test real GPS**.
3. Select **Enable 5-min checks**, or press **Check now**.
4. If a candidate route is estimated to save at least five minutes, Jalan offers **Switch route** or **Keep current**.
5. Declining pauses suggestions for ten minutes. The browser only checks while visible.

**Important:** This is an experimental suggestion system. The current route remaining ETA is a distance-scaled estimate, whereas the new TomTom route ETA is traffic-aware. Their comparison is indicative, not a guarantee of savings. A better production comparison requires refreshing the current-route ETA using the same provider and road constraints. No automatic route switching occurs.

API requests may incur costs. The TomTom key is entered in the browser and is not embedded in source. Safari may suspend tracking/timers when backgrounded. Do not use while driving.
