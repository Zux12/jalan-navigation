# Jalan Navigation V4.4.2 — Overpass endpoint fix

Replace the existing files in your GitHub Pages repository with this package.

## Changes
- Primary road lookup: `https://overpass-api.de/api/interpreter` (the server whose status you successfully checked).
- Fallback: `https://overpass.private.coffee/api/interpreter`.
- Removed the unreachable `overpass.nchc.org.tw` and unresponsive `overpass.kumi.systems` endpoints.
- Each request has a 12-second timeout. Maximum two attempts (~24 seconds plus overhead).
- Explicit unexpected-error handling prevents a permanently disabled Inspect button.
- Cancel, partial-result handling and 24-hour browser cache retained.
- Cache namespace and script version updated to avoid stale browser code.

## Test
1. Calculate a route, click **Inspect selected route**, and wait up to ~30 seconds. It should show road data or a final error.
2. Verify road names, types, and tagged speed limits where returned. Missing limits should read Unknown.
3. Repeat a successful inspection and check cached results.
4. Test Cancel and Clear, then verify navigation and iPhone layout.

**Limitations:** Server status success does not guarantee POST queries, cross-origin permissions or rate-limit availability. This is an experimental lookup using shared public Overpass capacity; avoid repeated bulk requests. No individual GPS history is uploaded, but route sample coordinates are sent to Overpass when requesting road tags.
