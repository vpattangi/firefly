// scripts/fetch_businesses.mjs
// Downloads businesses around campus with their weekly opening hours
// and saves them to businesses.json for the app to use.
//
// Run on your laptop (Node 22+), about once a week:
//   node --env-file=.env.local scripts/fetch-businesses.mjs
//
// Needs GOOGLE_PLACES_KEY in .env.local (gitignored), with Places API (New) enabled on that key.
// Use .env.local, NOT .env: only .env*.local files are gitignored in this repo.

import { writeFile } from 'node:fs/promises';

const API_KEY = process.env.GOOGLE_PLACES_KEY;
if (!API_KEY) {
  console.error('Missing GOOGLE_PLACES_KEY. Add it to .env.local and run:\n  node --env-file=.env.local scripts/fetch-businesses.mjs');
  process.exit(1);
}

// ---- Settings you can change ----
const CENTER = { lat: 37.3352, lng: -121.8811 }; // middle of SJSU
const HALF_SIZE_M = 1000;  // covers a 2 km by 2 km square around CENTER
const SPACING_M = 300;     // distance between search points
const MAX_SPLIT_DEPTH = 1; // how many times a crowded area can be split into smaller searches
const MAX_REQUESTS = 300;  // safety limit: the script stops itself after this many requests
const OUTPUT_FILE = new URL('../src/data/businesses.json', import.meta.url);
// ---------------------------------

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';
// Only ask for the fields we use. Opening hours are what make this an Enterprise request.
const FIELD_MASK = 'places.id,places.displayName,places.location,places.regularOpeningHours,places.primaryType,places.types';
const MAX_RESULTS = 20; // Google's limit per search

// Move a point by some meters east (dx) and north (dy).
function offset(point, dxM, dyM) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((point.lat * Math.PI) / 180);
  return { lat: point.lat + dyM / metersPerDegLat, lng: point.lng + dxM / metersPerDegLng };
}

// Square grid of search points covering the area.
function buildGrid() {
  const points = [];
  for (let dy = -HALF_SIZE_M; dy <= HALF_SIZE_M; dy += SPACING_M) {
    for (let dx = -HALF_SIZE_M; dx <= HALF_SIZE_M; dx += SPACING_M) {
      points.push(offset(CENTER, dx, dy));
    }
  }
  return points;
}

let requestCount = 0;

async function searchCircle(center, radiusM) {
  if (requestCount >= MAX_REQUESTS) {
    throw new Error(`Stopped: reached the ${MAX_REQUESTS} request safety limit`);
  }
  requestCount++;
  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      maxResultCount: MAX_RESULTS,
      locationRestriction: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM },
      },
    }),
  });
  if (!res.ok) throw new Error(`Places API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.places ?? [];
}

// Search one square cell. If it hits the 20-result limit, the area is crowded and
// some places were probably cut off, so split it into 4 smaller cells and search those too.
async function searchCell(center, cellSizeM, depth, found) {
  const radiusM = cellSizeM * 0.75; // just big enough for the circle to cover the whole square
  const places = await searchCircle(center, radiusM);
  for (const place of places) found.set(place.id, place);

  if (places.length === MAX_RESULTS && depth < MAX_SPLIT_DEPTH) {
    const q = cellSizeM / 4;
    for (const [dx, dy] of [[-q, -q], [q, -q], [-q, q], [q, q]]) {
      await searchCell(offset(center, dx, dy), cellSizeM / 2, depth + 1, found);
    }
  }
}

// Places that can be "open" without bringing light or people (often 24/7 and empty at night).
// These are dropped so they never make a route look safer than it is.
const EXCLUDED_TYPES = new Set([
  'park', 'city_park', 'dog_park', 'playground', 'national_park', 'state_park', 'garden',
  'hiking_area', 'campground', 'picnic_ground', 'beach', 'marina',
  'parking', 'parking_lot', 'parking_garage', 'park_and_ride',
  'electric_vehicle_charging_station', 'atm', 'storage', 'self_storage',
  'cemetery', 'bus_stop', 'transit_station', 'light_rail_station', 'train_station',
  'tourist_attraction', 'historical_landmark', 'monument', 'sculpture', 'plaza',
]);

function isExcluded(place) {
  if (place.primaryType && EXCLUDED_TYPES.has(place.primaryType)) return true;
  // No primary type: fall back to checking all of its types.
  if (!place.primaryType && (place.types ?? []).some((t) => EXCLUDED_TYPES.has(t))) return true;
  return false;
}

let excludedCount = 0;

// Keep only what the app needs, and drop places with no hours or an excluded type.
function simplify(place) {
  const periods = place.regularOpeningHours?.periods;
  if (!periods || periods.length === 0) return null;
  if (isExcluded(place)) {
    excludedCount++;
    return null;
  }
  return {
    id: place.id,
    name: place.displayName?.text ?? 'Unknown',
    type: place.primaryType ?? null,
    lat: place.location.latitude,
    lng: place.location.longitude,
    periods,
  };
}

async function main() {
  const grid = buildGrid();
  console.log(`Searching ${grid.length} grid points around campus...`);

  const found = new Map(); // keyed by place ID, so duplicates disappear automatically
  try {
    for (const [i, point] of grid.entries()) {
      await searchCell(point, SPACING_M, 0, found);
      process.stdout.write(`\r  ${i + 1}/${grid.length} points done, ${found.size} places so far`);
    }
    console.log();
  } catch (err) {
    // Save whatever was found so far instead of losing it.
    console.log(`\n${err.message}. Saving what was found so far.`);
  }

  const businesses = [...found.values()].map(simplify).filter(Boolean);

  await writeFile(
    OUTPUT_FILE,
    JSON.stringify({ fetchedAt: new Date().toISOString(), center: CENTER, businesses }, null, 2)
  );

  console.log(`Requests made: ${requestCount}`);
  console.log(`Places found: ${found.size}`);
  console.log(`Dropped as parks, parking, and similar: ${excludedCount}`);
  console.log(`Saved businesses with opening hours: ${businesses.length}`);
  console.log('Saved to src/data/businesses.json');
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
