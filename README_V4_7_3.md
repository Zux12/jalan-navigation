Jalan V4.7.3 — Navigation menu fix

Root cause: navigation-menu.js was not referenced by index.html in V4.7.2.
This release adds the script tag and improves collapsed-panel sizing while the menu is open.

Upload all frontend files to the existing Jalan GitHub Pages repository. No Heroku/MongoDB changes.

Test: start GPS navigation, tap Menu, verify main panel and Shared Traffic appear, tap Close menu, verify GPS remains active. Repeat in simulation and on iPhone.
