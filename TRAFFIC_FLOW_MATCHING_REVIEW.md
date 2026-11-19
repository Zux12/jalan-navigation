# Sampled traffic geometry review — 17 November 2026

Status: **DRAFT, not a direction/grade acceptance or public release**.
Baseline: `main@cd1e47ed97e9f08f46b214e51b60ed50c8f98e6d`.
The published PR54 exact-route vertices and MapLibre layer fix are already complete.

## Provider contract and remaining limitation

[TomTom Flow Segment Data v4](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data), reviewed 17 November 2026 (page edited 12 November), describes a nearest-road-point lookup with display geometry shifted according to zoom. Confidence measures speed/travel-time quality, not selected-route identity. The documented request has no route ID, selected-route indexes or heading filter. Coordinate sequence order is not explicitly documented as a traffic-direction guarantee. Inferring direction solely by reversing that array is therefore not justified.

The optional OpenLR reference is a potential identity path, not an automatic solution: [TomTom's reference decoder](https://github.com/tomtom-international/openlr) performs map-dependent location decoding. No OpenLR decoder, matching road network or live provider identity was validated here. No extra provider call, key, map service or backend was introduced.

## Reproduced defects and correction

The baseline matcher accepts any route-cell endpoints within 16 m of flow geometry. New synthetic negative controls reproduced a 45-degree crossing as **40 m of heavy traffic**, and a five-metre segment as a longer matched cell. Coloured output also rounded evidence boundaries onto 20 m cells.

The draft now clips actual projected overlap within the existing 16 m corridor; requires absolute local alignment within 30 degrees and a continuous overlap of at least 40 m containing the queried point; excludes endpoint-radius extensions, zero-length segments and disconnected short touches. Shorter matches remain unknown. These thresholds are conservative JALAN policies, not provider accuracy guarantees. Confidence must fall in [0.5, 1].

Classification uses exact evidence start/end distances and highest-severity overlap, retaining original route vertices. It no longer rounds traffic boundaries to 20 m cells. Route-indexed incidents, colours, six-query bound, key revocation, refresh timing and OSRM separation are preserved.

## Evidence and limits

| Control | Draft result |
| --- | --- |
| 45/60/90-degree crossing | Rejected |
| Degenerate geometry, 5 m overlap and endpoint-only touch | Rejected |
| Disconnected 20 m touches | Rejected, not accumulated |
| Aligned dense 10 m segments / connected right-angle bend | Retained |
| 50 m flow segment | Exact 125–175 m overlap; no endpoint extension |
| Provider incident at irregular route vertices | Exact 73–137 m boundaries |
| Overlapping severity / unclassified gaps / expired incidents | Preserved |
| Key revocation / repeated render / OSRM fallback | Existing controls pass |
| Parallel road 20 m away | Rejected |
| Parallel road 8 m away / reversed coordinates / coincident roads | **Still ambiguous**; geometry can match, directionVerified and gradeVerified remain false |

Local verification: `node --test tests/passenger-route-traffic.test.js` **15/15 PASS**, and JavaScript syntax check PASS. These are fixtures, not 15 real journeys. Existing GitHub desktop/390px/MapLibre CI must pass on the final draft SHA before any release decision.

## Next acceptance step

Keep this work isolated until reviewed. Validate a separately obtained, authorized provider segment identity/direction (potentially fully decoded OpenLR against an appropriate road graph) against the selected route on opposite-carriageway and stacked-road examples. If that identity cannot be established, sampled flow remains a passenger-preview heuristic; do not mark it route-direction verified or N06/N10 accepted. Route-indexed incidents already carry a stronger route association.

No real TomTom key, physical road evidence, private Heroku code release/restore, original Mterms change, database write or schedule modification occurred. Independent KL route acceptance remains 0/20.
