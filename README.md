# Jalan Navigation V4.4.1 — Overpass reliability fix

Upload all project files to the root of the existing Jalan GitHub Pages repository. Existing navigation, TomTom, Waze comparison and GPS features are retained.

## Improvements
- Each Overpass request has a 12-second browser timeout; after failure, tries two alternate public Overpass instances sequentially.
- Cancel lookup stops the active request and prevents late responses from changing the interface.
- Cached successful road lookups remain available for 24 hours in the current browser.
- If fresh retrieval fails but some samples are cached, partial results are shown.
- Failures display a message rather than waiting forever.

Public Overpass services can still be down, rate limited, or reject cross-origin requests. The cache is a convenience, not authoritative road data. Three fallback attempts may take up to 36 seconds. Avoid repeated scanning. Route sample coordinates are sent to public Overpass servers when uncached. No GPS history is uploaded.

## Test
1. Search for a route and click Inspect selected route. Observe status changing and either results or an error within about 36 seconds.
2. Click Cancel lookup during a pending request. Confirm the button re-enables and status says cancelled.
3. When a lookup succeeds, repeat it and confirm cached results appear promptly.
4. Clear road inspection and confirm markers disappear.
5. Verify TomTom routing, GPS, and iPhone layout still work.

Note: successful static syntax checks do not prove remote Overpass availability. This is not a production road-matching service.
