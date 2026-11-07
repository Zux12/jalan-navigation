# Jalan Navigation V3.8 — Experimental GPS Mode

Based on V3.7. Upload all root files to the existing GitHub Pages repository.

## New
- **Test real GPS** button appears after calculating a route.
- Foreground `watchPosition` GPS tracking, accuracy display, approximate remaining ETA/distance, off-route warnings.
- Manual **Recalculate route** and optional auto rerouting after four consecutive accurate fixes outside the route (85 m or twice accuracy, whichever is larger), with 90-second cooldown.
- Simulation mode remains separate.

## Important limitations
- This is a prototype, **not safe driving navigation**. Do not operate while driving. Test stationary or as a passenger.
- No validated turn-by-turn guidance, road-level map matching, voice guidance, guaranteed background GPS, or safety-critical rerouting.
- ETA uses proportional route progress, not continuously refreshed traffic estimates. Recalculate requests new TomTom traffic-aware routes when TomTom is enabled.
- iOS Safari may suspend location tracking in the background. GPS requires HTTPS and permission.
- Browser-exposed TomTom keys are visible in network requests; retain domain restrictions and monitor quotas.

## Suggested tests
1. Existing TomTom routes, live traffic, incidents and simulation still work.
2. After calculating a route, click Test real GPS; allow location.
3. GPS accuracy and remaining distance appear, and Exit restores normal map.
4. While stationary, check that inaccurate GPS readings do not cause automatic rerouting.
5. Manual Recalculate route works, and TomTom remains the primary provider when enabled.
6. Verify mobile layout in portrait and landscape.
