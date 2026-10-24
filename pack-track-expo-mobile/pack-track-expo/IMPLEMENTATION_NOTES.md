# Implementation checklist for the team

## Included in this scaffold
- Expo / React Native app shell and map screen
- Foreground GPS permission and current-location marker
- Sample business markers and sample alert circles
- OpenRouteService geocoding + foot-walking alternatives request
- Turf-based route proximity checks
- 30-metre nearby-business count and open-businesses-per-kilometre score
- Filter for routes within 25% of the shortest alternative
- Opening-hours helper and example weekly JSON cache schema
- Google Places API (New) Nearby Search helper

## Still required for a production-ready implementation
1. Connect live Places results to the map and normalize the returned weekly opening hours.
2. Implement an authorized weekly cache refresh job after confirming current Google Maps Platform storage rules.
3. Use a backend proxy for API keys and enforce rate limits; do not expose unrestricted keys in the app.
4. Improve alert geometry so it checks only the remaining route ahead of the user's current position, and handle route alternatives consistently.
5. Add live incident data, confirmed alert severity, route reroute notifications, Supabase persistence/realtime, and buddy matching.
6. Test on real iOS and Android devices, including location denial, no network, and API errors.
