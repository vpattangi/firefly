## Christina's Contribution: Pack Track Mobile Prototype

I created a mobile prototype for Pack Track to explore ways to make coordinating safer walks easier and more accessible.

### Key Features

- **Mobile App Prototype:** A React Native and Expo-based interface designed to support the Pack Track experience.
- **Buddy Matching:** Matching logic to help users explore walking with compatible buddies.
- **Route Planning:** A routing service to support planning walking routes.
- **Nearby Places:** A Google Places service to help locate nearby points of interest.

### Project Goal

My goal was to explore how mobile development and location-based features could support Pack Track's mission of helping people coordinate walks and feel safer getting to their destinations.

### Implementation Notes

This prototype is maintained separately from the team's main application so its features can be reviewed and tested before any integration. It is a development prototype, and the features should be tested and connected to the team's existing systems before being considered production-ready.

**Contributor:** Christina Szele  
**Repository:** [SJSU Hackathon Safety App](https://github.com/maxogarcia/SJSU_Hackathon_Safety_App)  
**Branch:** `christina-mobile-prototype`
# Pack Track — Expo mobile prototype

Pack Track is an SJSU student walking-safety prototype. This version uses **React Native + Expo** for iPhone/Android and includes a map, GPS permission flow, sample businesses/alerts, a routing integration scaffold, opening-hours logic, and route scoring.

## Tech stack

| Piece | Tool | Job |
|---|---|---|
| App | React Native + Expo | Runs on iPhone and Android |
| Map display | `react-native-maps` | Draws map, route, alert circles, and business markers |
| GPS | `expo-location` | Gets the student's current location with permission |
| Business hours | Google Places API (New), Nearby Search | Requests nearby businesses and regular hours |
| Hours cache | JSON cache example | Shows the weekly cache format; refresh job and policy validation still need implementation |
| Open-now check | Local `isOpenNow()` function | Checks today's open/close window, including overnight hours |
| Routing | OpenRouteService `foot-walking` | Requests walking route alternatives (up to three, where available) |
| Geometry | `@turf/turf` | Measures businesses within 30 m of a route and checks alert-zone proximity |
| Route scoring | `scoreRoute()` | Scores open businesses per km; routes more than 25% longer than shortest are filtered before scoring |

## Run locally

1. Install Node.js LTS.
2. Extract the project and open the `pack-track-expo` folder in VS Code.
3. In Terminal run:

```bash
npm install
npx expo start
```

4. Install **Expo Go** on your phone and scan the QR code. `react-native-maps` behavior can vary by platform and SDK; if the map does not load in Expo Go, use an Expo development build and follow Expo's current setup guide.
5. To use real route requests, copy `.env.example` to `.env` and add a restricted OpenRouteService key. Restart Expo after changing environment values.

## API and security setup

- OpenRouteService: create a key, enable the walking directions/geocoding APIs permitted by your plan, and set `EXPO_PUBLIC_ORS_API_KEY` for local demo use.
- Google Places API (New): enable Places API (New) and billing, restrict the key, and use a backend proxy for production. The included helper is a scaffold; the UI currently displays sample businesses and does not yet replace them with live results.
- Never commit real API keys. `EXPO_PUBLIC_` values are bundled into the client and are not secret. For a production app, route calls through a server that protects keys and enforces quotas.
- Google Places data storage/caching has contractual restrictions. Before persisting hours in a JSON file and refreshing weekly, confirm the current Google Maps Platform terms allow the intended fields and cache duration. The included JSON is a schema example, not a live cache.

## Route behavior and limitations

- Requests up to three OpenRouteService walking alternatives, if the service returns them.
- Filters candidates to routes no more than 25% longer than the shortest returned route.
- Scores routes by the number of sample businesses with currently open demo hours within 30 metres per kilometre.
- Applies a strong penalty to a route that intersects a demo alert circle. The current alert check is a prototype and may flag any part of the route, not only the portion ahead of the user.
- The app does not yet convert Google's `weekdayDescriptions` into the internal hour format or refresh the cache weekly. That adapter and scheduled refresh are next implementation tasks.

## Important safety note

This is a prototype. Business data and alert zones are samples; route scores do not prove a route is safe. Real incident validation, live alert synchronization, buddy matching, user authentication, accessibility testing, and privacy/security review are still required. Do not present the prototype as an emergency service or substitute for 911/campus police.

## Suggested GitHub workflow

Create a branch, test the app, and submit a pull request instead of pushing directly to your team's main branch:

```bash
git checkout -b feat/mobile-routing-stack
git add .
git commit -m "Add Expo mobile map and safer walking route prototype"
git push -u origin feat/mobile-routing-stack
```

Then open a pull request on GitHub and ask your team to review it.

## Buddy matching prototype
The home screen also includes a sample buddy-match flow. It filters sample students by matching preference, destination keywords, a departure window of ±10 minutes, and meetup distance, then provides separate buddy and meetup confirmation buttons. This remains demo logic: do not infer real users' gender or automatically assign a real person; let users explicitly choose their preference, provide privacy controls, and confirm every match.
