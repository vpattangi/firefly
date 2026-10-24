This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

# Firefly (formerly PackTrack) — project guide for agents

PackTrack pairs verified university students so they can walk home from campus together. Students meet at a safe meetup point, get matched with others heading the same way, walk as a group, and each person peels off at the point closest to their own destination. Human-facing setup docs are in `README.md`; this section is the context an agent needs before changing code.

## Privacy rules (do not break these)

These are the core promises of the app. Every change must keep them true, and they are enforced in the **database**, not just the UI:

1. **Only `.edu` emails can sign up.** Enforced by the `enforce_edu_email` trigger on `auth.users`. The client check in `sign-in.tsx` is only for a nicer error message. **Temporary exception (first draft):** addresses in `public.test_email_allowlist` (migration 0005, mirrored by `TEST_EMAILS` in `sign-in.tsx`) may also sign up, for testing. Those test accounts also have a shared password set directly in `auth.users` and skip the email link (password box in `sign-in.tsx`). Empty the allowlist, `TEST_EMAILS` and the password sign-in before launch.
2. **No matching until a government ID is verified.** `create_walk_request` and `find_or_create_group` require `profiles.verification_status = 'verified'`. Users can't change that column (column-level `grant update (first_name, avatar_path)`); only `review_id_verification(email, approved)` can, and app users can't call it.
3. **ID photos are never readable by other students.** The `id-documents` bucket has an insert policy for the owner's own folder and **no select policy**.
4. **Destinations and routes are private.** `walk_requests` is select-own only. Other group members see only status, split point, split order and a rounded distance (via `get_group_details`); first name and photo only after the reveal (rule 5).
5. **Names and photos unlock only within ~30 ft (migration 0006).** Two confirmed members are revealed to each other when the server sees their fresh positions within 9.1 m (`update_my_position`), or when the walk starts. Until then `get_group_details` returns `first_name`/`avatar_path` as null, and the avatars storage policy (`is_revealed_to_me()`) blocks the photo. Raw positions live in `member_positions`, which no client can read, and are deleted when a member leaves/arrives or the group ends. "I'm here" (`mark_here`) only works after a reveal.
6. **Contact info is shared only when both people opt in after a completed walk.** `contact_info` is select-own only; other people's contact details only come back from `get_share_status` / `get_mutual_contacts` when both `contact_shares` rows exist.
7. **Live location goes only to group members.** It uses a *private* Realtime broadcast channel `group:<group_id>`, gated by policies on `realtime.messages`. Broadcasts carry no names.
8. **Buddy preferences are enforced in the database (migration 0006).** `profiles.gender` is set only via `set_my_gender` (locked during an active walk). `women_only` is allowed only for gender `woman`; `women_nonbinary` only for `woman`/`nonbinary`. `find_or_create_group` only joins groups where every member satisfies every other member's preference (`buddies_compatible`).

If a feature seems to need loosening one of these, stop and ask the team instead of working around it.

## Architecture

```
src/app/                    Expo Router screens
  _layout.tsx               Root Stack + auth guards (Stack.Protected): sign-in → onboarding → (tabs)
  sign-in.tsx               .edu email → sign-in link (or code) via supabase.auth.signInWithOtp
  auth-callback.tsx         where the email link lands; SessionProvider sets the session from the URL
  onboarding.tsx            name, avatar, contact info, ID photo + selfie → submit_id_verification
  (tabs)/_layout.tsx        JS tab bar (Map · Alerts · Buddies · Profile), see components/app-tabs.tsx
  (tabs)/index.tsx          "Map" tab: pick meetup point + destination → Routes API walking route → create request → join group
  (tabs)/alerts.tsx         community alerts feed: active incidents (list_active_incidents) + report button
  (tabs)/buddies.tsx        mutual contacts (get_mutual_contacts)
  (tabs)/profile.tsx        profile, contact info, sign out
  group/[id].tsx            live group: members, split points, confirm/start/arrive, live location
  share/[id].tsx            opt-in contact sharing after a completed walk
src/lib/
  supabase.ts               Supabase client (session in expo-sqlite localStorage)
  api.ts                    ALL database access: typed wrappers around tables and RPCs
  directions.ts             Google Routes API (walking) + polyline decoding; straight-line fallback with no key
  images.ts                 image picker, upload to Storage, signed avatar URLs
src/providers/session.tsx   session + profile context, isOnboarded()
src/components/             UI kit: Screen (+ Header, Card, Field, Notice), Button, Chip, Avatar, SafetyBar, WalkMap (+ .web fallback)
supabase/migrations/        database schema, privacy rules and all matching logic
supabase/tests/             SQL scenario test against plain PostGIS (see "Testing")
```

**Most of the business logic is in Postgres, not TypeScript.** The client calls security-definer RPCs; it never writes to `walk_requests`, `walk_groups`, `group_members` or `contact_shares` directly. Key RPCs in `supabase/migrations/0001_packtrack.sql`:

| RPC | Purpose |
| --- | --- |
| `create_walk_request` | Stores destination and route (GeoJSON `[[lng,lat],…]`); requires verified status |
| `find_or_create_group` | Joins the best forming group (same meetup point, ±15 min, max 4) where nobody's trip grows >35% and the newcomer walks a real stretch together; otherwise creates one |
| `recompute_split_points` | Internal (0002). Picks an anchor member; the group walks the anchor's route and each member splits at the closest point to home, never within ~100 m of anyone's home |
| `plan_with_anchor` / `best_plan` | Internal (0002). Score a group plan for a given anchor: split points, distance together/alone, detour ratio |
| `get_group_details` | Everything the group screen shows, with privacy filtering applied |
| `confirm_group` / `start_walk` / `leave_group` / `mark_arrived` | Group lifecycle: `forming → walking → completed` (or `cancelled`) |
| `set_contact_share` / `get_share_status` / `get_mutual_contacts` | Mutual opt-in contact sharing |
| `review_id_verification` | Reviewer-only (SQL editor). Approves or rejects a student's ID |

Member status: `joined → confirmed → arrived` (or `left`).

## Changing the database

- `0001`–`0005` have **already been applied** to this app's Supabase project (`hgliziuyfbnhvyjgjluh`, us-west-1). The original team project (`ivsgdxmiuahfzfhxkook`) has 0001–0002 applied; run 0003 and 0004 there too if it's still used. **Never edit applied migrations.** Add a new file `supabase/migrations/000N_<description>.sql` with only the changes (`create or replace function …`, `alter table …`), and tell the human to run it in the Supabase SQL Editor.
- New RPCs: use `security definer`, `set search_path = public, extensions`, check `auth.uid()`, and add a typed wrapper in `src/lib/api.ts`. Internal helpers must `revoke execute … from public, anon, authenticated`.
- PostGIS is installed in the `extensions` schema. Return lat/lng as plain numbers (`st_y(geom)`, `st_x(geom)`) because PostgREST returns geometry as hex.

## Testing

```bash
npx tsc --noEmit     # clean (run `npx expo start` once first so expo-env.d.ts exists)
npx expo lint        # clean
```

Database logic: `supabase/tests/scenario.sql` runs the whole flow (signup rules, verification gate, matching, split points, photo and contact privacy) on a throwaway PostGIS container. `00_supabase_stubs.sql` stands in for Supabase's auth/storage/realtime schemas:

```bash
docker run -d --name pt-pg -e POSTGRES_PASSWORD=pw postgis/postgis:16-3.4
docker cp supabase/tests/00_supabase_stubs.sql pt-pg:/tmp/a.sql
docker cp supabase/migrations/0001_packtrack.sql pt-pg:/tmp/b.sql
docker cp supabase/migrations/0002_shared_path_matching.sql pt-pg:/tmp/b2.sql
docker cp supabase/tests/scenario.sql pt-pg:/tmp/c.sql
for f in a b b2 c; do docker exec pt-pg psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/$f.sql; done
docker rm -f pt-pg
```

Every check prints `NOTICE: PASS: …`; a failure raises `FAIL: …`. Apply new migrations after `b2.sql` and extend `scenario.sql` when you change matching or privacy logic. (On Git Bash for Windows, `export MSYS_NO_PATHCONV=1` first.)

## Conventions

- The UI follows the Pack Track Figma export (SJSU navy `#073767`, blue `#0055A2`, gold `#E5A823`). It is light-only: `useTheme()` returns `Colors.light` and app.json sets `userInterfaceStyle: "light"`.
- Colors come from tokens in `src/constants/theme.ts` (`accent`, `navy`, `amber`, `amberSoft`, `border`, `success`, `warning`, `danger`, …) via `ThemedText themeColor=` / `useTheme()`. Don't hardcode colors in screens (the sign-in hero illustration is the one exception).
- Build screens from `Screen` (pass `title`/`subtitle` for the design's page header, `footer` for a pinned action), `Card`, `Field`, `Notice`, `ErrorText` (`src/components/screen.tsx`), `Button` (`src/components/button.tsx`, `variant="secondary"` is the outlined style) and `Chip`. Icons are `@expo/vector-icons` Ionicons.
- `react-native-maps` has no web support: map code goes through `WalkMap`, which has a `.web.tsx` fallback.
- The SafeWalk phone number and meetup coordinates are placeholders to check (`theme.ts`, seed data in the migration).
- The React Compiler lint rules are on: don't call `setState` directly inside `useEffect`, and don't call `Date.now()` during render.

## Local environment gotchas

- Env vars live in `.env.local` (git-ignored; template in `.env.example`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, optional `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. Never commit keys or tokens.
- The project is developed in WSL, so phones can't reach the dev server over LAN. Use `npx expo start --tunnel`. That needs the Expo CLI signed in to the same account as Expo Go (`npx expo login`, or an `EXPO_TOKEN` env var). Without a login, use `npx expo start --tunnel ngrok`.
- Supabase's built-in email sender allows only ~2 emails per hour; configure custom SMTP for team use. Sign-in works with Supabase's default emails: they contain a link that redirects to `auth-callback` (`src/lib/auth-link.ts`), which the app turns into a session. That needs `exp://**`, `packtrackapp://**` and `http://localhost:8081/**` under Authentication → URL Configuration → Redirect URLs. Typing a 6-digit code also works if the templates include `{{ .Token }}` (template edits need custom SMTP).
- To approve a test account: `select public.review_id_verification('someone@sjsu.edu', true);` in the SQL Editor.

## Known gaps / ideas

- ID review is manual. Production should use Stripe Identity or Persona, with a webhook calling `review_id_verification`.
- The Google Routes API key is used from the client; move it to a Supabase Edge Function before launch.
- No push notifications yet (e.g. "someone joined your group"). The group screen updates through Realtime only while it's open.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
