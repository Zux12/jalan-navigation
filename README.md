# Jalan Navigation V4.6 — Historical Road Speed & Smart Confirmation

Built from V4.5.1. Upload all files to GitHub Pages, including `historical-speed.js` and `smart-confirmation.js`.

Historical speed: local browser records, synthetic week generator, weekday/weekend and four daily time groups, median baseline, minimum 5 observations per group, CSV export. The demo records are synthetic and should not be treated as real road speeds.

Smart Traffic Confirmation: manual preview; optional GPS-based slowdown detection when actively navigating, reliable route-matched GPS and 5+ historical observations exist. Asks only “Are you stuck in traffic?”, dismisses after 8 seconds, ignores nonresponse, 15-minute cooldown. Answers are local-only and not published. Requires foreground navigation. Avoid interacting with the device while driving.

Note: road segment identifiers are user-entered test labels, not automatically map-matched unique road IDs. This is not yet a validated live traffic engine.
