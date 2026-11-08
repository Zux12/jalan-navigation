Jalan V4.7.1 — Shared Traffic UI/API fix

Upload all files to the root of the existing jalan-navigation GitHub Pages repository.
Changes: shared traffic panel moved inside main panel after Smart Traffic Confirmation; API base corrected to the verified MTerms Heroku domain; HTML title and cache query updated.
No Heroku or MongoDB changes required.
Test: expand Show route details, find V4.7 Shared Traffic Pilot below Smart Traffic Confirmation, click Check nearby shared traffic while GPS navigation is active; test sharing only with explicit consent and while stationary/passenger. MongoDB writes require accurate moving GPS fixes and can be absent while stationary.
