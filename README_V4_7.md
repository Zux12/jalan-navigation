# Jalan Navigation V4.7 pilot
Upload all files to the existing GitHub Pages repository. GPS sharing is OFF by default. The new `shared-traffic.js` sends a fix only when GPS navigation is active, user opted in, accuracy <=25m, speed 5–150km/h, and heading available/derivable. It never sends the route label as a road identity. The backend returns aggregate coarse grid data only when 3+ independent sessions contributed within five minutes. This is a pilot, not verified traffic intelligence.

Deploy the backend additions first; see backend README. No MTerms code is replaced by this frontend package.
