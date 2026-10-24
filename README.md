# Firefly

*find your sparkle* — formerly PackTrack.

Pairs verified university students so nobody walks home from campus alone. Students meet at a safe meetup point, get matched with others heading the same way, walk together, and each person peels off at the point closest to their own destination.

## How it works

1. **Sign in** with a `.edu` email (one-time code). Non-university emails are rejected by the database.
2. **Verify** with a profile photo, a photo of a government ID and a selfie. ID images go to a private bucket that only reviewers can read. Matching stays locked until a reviewer approves.
3. **Plan a walk**: pick a meetup point, tap your destination on the map and choose when you're leaving. The app gets a walking route from the Google Routes API.
4. **Get matched**: PostGIS joins you to a forming group at the same meetup point (departing within 15 minutes, max 4 people) heading your way, as long as nobody's walk gets more than ~35% longer.
5. **Confirm**: confirming shares your profile photo with that group only. You see someone's photo once you've both confirmed.
6. **Walk**: the group follows one shared path, and each person peels off at the point closest to their home. For privacy, splits happen at least ~100 m before anyone's home. Live locations are shared over a private Realtime channel only group members can join. SafeWalk call/text and 911 buttons are always on screen.
7. **After the walk**: everyone taps "I'm home safe." Then each person can choose who to share contact info with. Info is revealed only when both people opt in.

## Firefly update (migration 0006)

Run `supabase/migrations/0006_firefly_buddies_and_reveal.sql` in the Supabase SQL Editor after 0005.

- **Women's buddy system.** Students pick a gender (Woman, Man, Non-binary) in onboarding or Profile. When planning a walk they choose who to walk with: **Anyone**, **Women and non-binary** (for women and non-binary students) or **Women only** (only for students who selected Woman). Matching respects every member's choice in both directions.
- **Reveal at ~30 ft.** Until you meet, buddies only see "SJSU student", their status, the meetup point and a rounded distance ("About 120 ft away"). Names and photos unlock when both phones are within about 30 ft, or when the walk starts. Then **I'm here** becomes available. Exact positions never reach other phones and are deleted after the walk.
- **Smarter matching.** The team's Python walking-buddy scorer (`match_score.py`) is now built into `find_or_create_group`: among groups that pass the safety limits, the best one wins on shared walk (30%), destination closeness (20%), detour (30%), departure time (10%) and waiting time (10%). The separate Python service is no longer needed.
- **Branding.** Firefly logo (Abril Fatface + firefly mark), "find your sparkle" tagline, a "searching for your sparkle" loader with twinkling sparkles, and navy in place of every blue.

Database tests (needs Postgres + PostGIS): run `00_supabase_stubs.sql`, all migrations, then `scenario.sql`, `incidents.sql` and `firefly.sql`, each in a fresh database.

## Reports, danger zones and rerouting

8. **Report a problem** (plan screen or during a walk): photo + a few words. If it sounds like someone is in danger, the app asks "Is anyone in danger right now?" and puts 911 / UPD first; emergencies never go into a repair queue.
9. **EAiSER** classifies the report (issue type, severity, building, where it goes, status). Until we have the EAiSER for Campuses API, `src/lib/eaiser.ts` runs an on-device stand-in with the same output, marked "EAiSER simulated". Set `EXPO_PUBLIC_EAISER_URL` / `EXPO_PUBLIC_EAISER_KEY` to call the real one.
10. **Danger zone**: `submit_incident` stores it with a radius by category (merging duplicates within 50 m) and Realtime pushes it to every phone.
11. **Rerouting**: the group walks the anchor's route, so the anchor's phone (the only one that knows where that route ends) reroutes the shared path around new zones (`src/lib/safety.ts`) and saves it with `update_my_route`; split points move and everyone's map updates over Realtime ("Group route updated to avoid broken lighting ahead"). Each other member's phone reroutes their own private solo leg home.
12. **Dashboard** (Profile → Campus safety dashboard): active problems, students walking, reroutes. Staff listed in `safety_admins` can mark problems In progress / Resolved, which removes the zone.

Setup: run `supabase/migrations/0003_incidents.sql` in the SQL Editor after 0001 and 0002. To make yourself staff:
`insert into public.safety_admins select id from auth.users where email = 'you@sjsu.edu';`


## Safest route: open businesses

Routes avoid every reported danger zone **and** prefer streets with businesses open at the moment you walk past them (lit storefronts, people around). `routeSafest()` in `src/lib/liveliness.ts` is a drop-in replacement for `routeAvoidingZones()`: it takes the shortest zone-free route, tries up to 3 detours through nearby blocks with several open places, and keeps a detour only if it still avoids every zone, is at most 25% longer, and passes clearly more open places per km. Late at night, when little is open, it just returns the shortest safe route.

- Business data is a Google Places snapshot in `src/data/businesses.json` (no key needed at runtime).
- `src/lib/place-filter.ts` counts only places that bring people (restaurants, bars, stores, gas stations, gyms, hotels…), and ignores "open 24 hours" for types where that usually means phone hours.
- Check the data without any keys: `npx tsx scripts/check-safety-data.ts`
- Refresh the snapshot (needs `GOOGLE_PLACES_KEY` in `.env.local`, Places API (New) enabled): `node --env-file=.env.local scripts/fetch-businesses.mjs`

## Stack

| Layer | Pick |
| --- | --- |
| App | Expo SDK 58, Expo Router, TypeScript |
| Maps & location | `react-native-maps`, `expo-location` |
| Backend | Supabase (Postgres + PostGIS + Realtime + Storage) |
| Routes | Google Routes API (walking mode) |
| SafeWalk call/text | `expo-linking` (`tel:` / `sms:`) |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run each file in [`supabase/migrations/`](supabase/migrations/) in order (`0001`, then `0002`). This creates the tables, privacy rules, storage buckets, Realtime policies and SJSU meetup points.
3. **Authentication → URL Configuration → Redirect URLs**: add `exp://**`, `packtrackapp://**` and `http://localhost:8081/**`. The sign-in email contains a link that opens the app; open it on the phone running the app.
4. **Authentication → Sign In / Providers**: make sure Email is enabled.
5. **Realtime → Settings**: turn off "Allow public access" if you want only private channels (the app uses private ones).

### 2. Google Routes API (optional but recommended)

Enable the **Routes API** in Google Cloud and create an API key (the older Directions API can no longer be enabled on new projects). Without a key the app falls back to straight-line routes, which still works for a demo but makes matching less accurate.

### 3. Environment

```bash
cp .env.example .env.local
# fill in EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
```

### 4. Run

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go**. The map and camera need a phone (or simulator). The web build shows an illustrative map with the pins listed instead of the live map.

The UI follows the Pack Track Figma design (SJSU navy/blue/gold, light mode); tokens are in `src/constants/theme.ts`.

### 5. Approve students (reviewer)

New users land in "ID under review". To approve or reject them, run this in the Supabase SQL editor:

```sql
select public.review_id_verification('student@sjsu.edu', true);   -- approve
select public.review_id_verification('student@sjsu.edu', false);  -- reject (they're asked to resubmit)
```

ID photos are in **Storage → id-documents/<user id>/**.

## Demo with two people

1. Sign up two `.edu` accounts on two phones and approve both with the SQL above.
2. Both pick the same meetup point, drop destinations in roughly the same direction and choose the same departure time.
3. Both land in the same group. Each taps **Confirm**, then **Start walking**, then **I'm home safe**, then **Share contact info**.

## Project layout

```
src/app/              screens (Expo Router)
  sign-in.tsx         .edu email + one-time code
  onboarding.tsx      profile photo, contact info, ID + selfie
  (tabs)/index.tsx    Map tab: plan a walk and get matched
  (tabs)/alerts.tsx   live community alerts (reported problems)
  (tabs)/buddies.tsx  people you mutually shared with
  (tabs)/profile.tsx  your profile and contact info
  group/[id].tsx      live group: members, split points, live locations
  share/[id].tsx      opt-in contact sharing after a walk
src/lib/              Supabase client, API calls, walking routes, image upload
supabase/migrations/  database schema, privacy rules and matching logic
```

## Known limitations

- ID review is manual. For production, swap in a provider such as Stripe Identity or Persona and have its webhook call `review_id_verification`.
- The Google key is used from the client. Before launch, move Routes API calls into a Supabase Edge Function so the key stays server-side.
- Meetup point coordinates and the SafeWalk number (`src/constants/theme.ts`) are approximate. Check them before demoing.
