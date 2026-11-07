# Jalan V4.2.1 — Road Speed Intelligence fixes

Upload the contents of this directory to the root of the existing `zux12/jalan-navigation` GitHub Pages repository. Replace the old files; keep your TomTom key out of GitHub.

## Fixes
- Tests 4 and 5: explicit `CONFIRMED` versus `INSUFFICIENT EVIDENCE` verdict in the status and segment result. The test uses the entered number of independent drivers and duration. An added observation **replaces** the prior synthetic test for the selected segment, avoiding ambiguous accumulated values.
- The multi-driver demo uses preset speeds and driver counts; to test manual inputs, click **Clear observations** first.
- Each colored road segment now follows the complete routed polyline instead of a straight chord between two endpoints.
- A white outline improves overlay visibility over the thick blue route.
- Existing traffic, routing, GPS, voice, Waze comparison and local journey logging files are retained unchanged.

## Test 4
Calculate a route. Clear observations. Enter normal speed 90, observed speed 18, drivers 1, duration 3, segment 1. Click **Add / Replace segment test**. Expect `INSUFFICIENT EVIDENCE`. Repeat with drivers 2: same verdict.

## Test 5
Change drivers to 3, leave speed 18 and duration 3, click **Add / Replace segment test**. Expect `CONFIRMED — Severe congestion`. Change duration to 1: expect `INSUFFICIENT EVIDENCE`.

These are illustrative thresholds, not production-ready confidence estimates. No data from other users is collected, shared or stored.
