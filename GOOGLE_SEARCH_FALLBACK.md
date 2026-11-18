# One-bar TomTom and Google destination lookup

The Passenger page supports TomTom and optional Google Places UI Kit suggestions. The Google browser key is empty by default. Fixtures are sample data used only in the test suite.

## Behaviour

- After the existing 450ms typing pause, search TomTom first with the current
  Malaysia/typeahead/5-result settings. No device coordinates accompany typing.
- For a multi-word query, retain TomTom results containing every normalized
  query token in the name/address. Longer partial tokens may prefix-match;
  one-character brand tokens must match exactly. This conservative heuristic
  distinguishes Q Bistro from Zaynas Bistro; aliases, misspellings and renamed
  places can filter out valid TomTom suggestions.
- Keep every matching branch in the returned TomTom page selectable. Also query Google for the same full text, including when TomTom has a match, has no result or is unavailable. No branch is selected automatically. Load Google's JavaScript SDK on demand and use
  **Places UI Kit Place Search**, driven by the original input. This is text
  search after a typing pause, not the separate Autocomplete SKU/widget.
- Keep Google's complete selectable result component and its attribution/legal
  controls. No second search field, separate provider button, ordinary Places
  REST request or `fetchFields` call. A Google error or empty response preserves available TomTom suggestions. Both providers may list the same branch.
- Selecting a returned point calls existing `selectDestinationPlace()`, then
  existing TomTom route choice. If the UI Kit event omits a display name, use
  honest `Selected destination` rather than inventing the selected business.
- New input, clear, collapse, submit, hidden page and destination selection
  detach old results and invalidate callbacks. Google keyboard focus can remain
  inside its widget after leaving the input. Google content is not cached.
- With Google disabled, TomTom still filters multi-word queries and retains its ranked aliases for single-word searches. Explicit Search can use Nominatim. Public Nominatim is never autocomplete.

## Enable and verify live Google results

1. Set the website-restricted browser key in `jalan-config.js` under `googleMapsBrowserKey`. The `googlePlacesFallback` flag is already enabled. Google requests require both settings.
2. The key's Cloud project must have billing and required Maps JavaScript /
   Places UI Kit services enabled. Configure website restrictions for the
   actual Pages host and API restrictions/quotas. Do not enable billing or
   create a paid resource without the owner's authorization. The existing
   TomTom key cannot authenticate Google.
3. Run the actual Google SDK under the staged CSP. Only specific Maps/Places,
   Google static/font and image hosts were added, without inline script or
   eval permissions. This has not yet been validated against the real SDK;
   evaluate actual violations rather than disabling CSP. Check the built-in
   legal disclosure and attribution at 390px, with the keyboard and scrolling.
4. Verify `q bistro` offers multiple branches and adding locality narrows the list. Verify `q bistro taman melati` returns the right business and entrance using
   actual Google results. Verify selected coordinates, label and TomTom route
   endpoint. Do not count synthetic tests or an existing Maps listing as live
   Google API coverage. Check no-result, invalid key, quota, SDK timeout and
   provider failure behaviour. Review matcher false negatives (e.g. aliases).
5. After publishing the configured key, check the Passenger page on the deployed Pages origin.

## Official references

- [UI Kit text search and input integration](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-search)
- [Widget events, returned locations and built-in keyboard support](https://developers.google.com/maps/documentation/javascript/reference/places-widget#PlaceSearchElement)
- [Service terms: UI Kit with non-Google maps and preserved attribution](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- [CSP guidance](https://developers.google.com/maps/documentation/javascript/content-security-policy)
- [UI Kit project/billing setup](https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started)
