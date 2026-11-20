# Jalan Navigation V4.6 — Historical Road Speed & Smart Confirmation

Built from V4.5.1. Upload all files to GitHub Pages, including `historical-speed.js` and `smart-confirmation.js`.

Historical speed: local browser records, synthetic week generator, weekday/weekend and four daily time groups, median baseline, minimum 5 observations per group, CSV export. The demo records are synthetic and should not be treated as real road speeds.

During Passenger Preview navigation, JALAN can ask “Are you stuck in traffic?” after sustained slow movement on a reliably matched route. It uses already available traffic speeds for that stretch or waits for two minutes of crawling when that information is unavailable. The question closes after eight seconds and has a 15-minute cooldown. Answers stay on the phone. With nearby community reports enabled for the journey, an approaching report takes priority and offers ten seconds to choose Still there or Cleared. The engineering dashboard retains its optional historical-speed test and manual preview.

Note: road segment identifiers are user-entered test labels, not automatically map-matched unique road IDs. This is not yet a validated live traffic engine.
