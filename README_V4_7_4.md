# Jalan V4.7.4 — Low-speed sharing reliability

Frontend-only change. No changes to MTerms, Heroku or MongoDB.

- Accepts accurate route-matched GPS speeds of 1–5 km/h.
- For speeds below 1 km/h, requires evidence of movement between fixes; parked/stationary readings are not blindly submitted.
- Calculates speed and direction from successive matched positions when browser GPS omits them.
- Displays reasons for skipped observations.
- Retains opt-in, Stop Sharing, and server-side 15-minute TTL.

Deploy all frontend files to the Jalan GitHub Pages repository. Test stationary first; then only as a passenger. A successful HTTP 202 produces the message “Last observation accepted”.

This is still a coarse-cell pilot; it does not reliably distinguish stopped traffic from a parking lot or traffic light. Do not use it for public congestion assertions.
