# Jalan Navigation V4.1 — Journey Reliability Log

Upload all web files in this folder to the root of your existing GitHub Pages repository, replacing matching files. The new file is `journey-log.js`.

## New functions
- GPS test journeys are logged locally (start/end time, predicted ETA, elapsed time, route switches, offers, GPS accuracy median).
- Arrived status requires 3 accurate GPS fixes within approximately 110 m of destination; stopping early is marked incomplete.
- Export separate journey and event CSV files. Clear locally stored logs.
- Precise GPS coordinates and TomTom API keys are not written into logs.

## Limitations
- Browser-based test only, not road-ready navigation. Background Safari can pause tracking.
- ETA error is computed only for automatically detected arrivals.
- Recalculation may restart the GPS session; the logger marks interrupted segments separately.
- Logged data is browser-local and can be lost if website storage is cleared.
- Do not use while driving; test stationary or as a passenger.

## Test
1. Verify normal routing and simulation.
2. Start a real GPS test while stationary, confirm the log status changes to recording.
3. Exit GPS, confirm an incomplete journey appears.
4. Export both CSV files and inspect rows.
5. Test clear logs only after exporting.
