// Sanity check for the safest-route data. No API keys needed.
//   npx tsx scripts/check-safety-data.ts
//
// 1. How many cached businesses count as "open and safe" at different times tonight.
// 2. How a sample walk near SJSU scores at those times.

import cache from '../src/data/businesses.json';
import type { Business } from '../src/lib/hours';
import { openAlongRoute } from '../src/lib/liveliness';
import { bringsPeople, isOpenForSafety } from '../src/lib/place-filter';

const { fetchedAt, businesses } = cache as unknown as { fetchedAt: string; businesses: Business[] };

// Student Union → San Pedro Square, as a simple straight-ish line (real routes come from Google).
const SAMPLE_WALK = [
  { latitude: 37.33525, longitude: -121.8812 },
  { latitude: 37.3366, longitude: -121.8857 },
  { latitude: 37.3376, longitude: -121.8889 },
  { latitude: 37.3364, longitude: -121.8945 },
];

console.log(`Cache from ${fetchedAt}: ${businesses.length} businesses, ${businesses.filter(bringsPeople).length} bring people to the street\n`);
console.log('Time         Open nearby   Open on sample walk');

const today = new Date();
for (const hour of [18, 21, 23, 24, 26]) {
  const time = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, 0);
  const openNearby = businesses.filter((b) => isOpenForSafety(b, time)).length;
  const walk = openAlongRoute(SAMPLE_WALK, time);
  const label = time.toLocaleString('en-US', { weekday: 'short', hour: 'numeric' });
  console.log(`${label.padEnd(12)} ${String(openNearby).padStart(11)}   ${walk.count} (${walk.perKm.toFixed(1)}/km) ${walk.names.slice(0, 2).join(', ')}`);
}
