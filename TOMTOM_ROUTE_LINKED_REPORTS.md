# TomTom route-linked traffic reports (isolated development)

## What changed

The old public Passenger Preview fetched Incident Details within a bounding box
and selected reported geometry whenever it came within 25 metres of the blue route.
This often confused parallel roads, carriageways and flyovers.

The new TomTom-specific route report proposal requests `sectionType=traffic` on
the existing TomTom Calculate Route request. The resulting `TRAFFIC` sections
carry provider route **startPointIndex/endPointIndex**. They are drawn **only**
from the currently selected TomTom route and are not picked by a fixed
25-metre radius. Road names and designations are taken from TomTom route
guidance `street`/`roadNumbers` at the applicable route section; names are
display labels, not the sole matching authority. The section's category,
effective speed and delay are displayed when provided.

The standalone Incident Details v5 response can supply `from`, `to`,
`roadNumbers`, geometry and TMC metadata. However, its `from` and `to`
are **location descriptions**, not guaranteed street names. The TMC
positive/negative direction cannot be converted into a travel bearing without
the reference table, and a LineString's vertex order alone is not proof of
traffic direction. **Do not attach an area incident to a route merely
because its name matches**. This proposal intentionally does not display
independent, unlinked Incident Details results as selected-route incidents.

## Limitations

- Route `TRAFFIC` sections are a **snapshot at the time of route calculation**.
  The UI expires this snapshot after 10 minutes; another route calculation is
  needed to refresh the route-specific reports. The live flow overlay remains
  separate and can refresh independently.
- The section categorization is not identical to individual Incident Details
  reports. This feature cannot promise all individual crashes, hazards or closures
  appear as distinct sections. A missing section means no verified route-linked
  report, **not** evidence of clear roads.
- Adjacent two-way carriageway cases are provider route associations, not
  separately authenticated lane-level location or legal-turn acceptance.
- Local demo community reports remain explicitly unverified, with a separate
  25-metre demo-only display rule. They do not establish TomTom route relevance.
- No independent 20-case KL road acceptance is provided by synthetic fixtures.
- No user position, API key, provider response, traffic observation, or Atlas
  document is stored or uploaded by this change. No private Heroku changes.
