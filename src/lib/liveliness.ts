// "Safest route" = avoids every reported danger zone (safety.ts) AND, among routes that do,
// prefers the one that passes the most businesses open while you walk past them —
// open businesses mean lit storefronts and people around instead of dark, empty streets.
//
// Runs on the phone like the rest of safety.ts, so routes stay private (AGENTS.md rule 4).
// Business data is a one-time Google Places snapshot in src/data/businesses.json.

import cache from '@/data/businesses.json';
import { distanceBetween, getWalkingRoute, type LatLng, type WalkingRoute } from '@/lib/directions';
import type { Business } from '@/lib/hours';
import { isOpenForSafety } from '@/lib/place-filter';
import { blockingZones, closestApproach, routeAvoidingZones, type Avoidance, type Zone } from '@/lib/safety';

const BUSINESSES = (cache as unknown as { businesses: Business[] }).businesses;

const WALKING_SPEED_MPS = 1.35;
const NEAR_ROUTE_M = 30; // a business this close to the path lights it up
const CORRIDOR_M = 250; // how far off the path to look for brighter streets
const CELL_M = 120; // size of the blocks used to find clusters of open places
const MIN_CLUSTER = 3; // a block needs at least this many open places to be worth a detour
const MAX_DETOURS = 3; // extra Routes API calls per plan
const MAX_LONGER = 1.25; // never more than 25% longer than the shortest safe route
const MIN_GAIN = 1.1; // a brighter route must be at least 10% better per km to win

export type OpenAlongRoute = {
  /** Open places within ~30 m of the path at the moment you'd pass them. */
  count: number;
  perKm: number;
  names: string[];
};

export type SafestPlan = Avoidance & {
  open: OpenAlongRoute;
  /** True when we picked a brighter route over the shortest safe one. */
  brighter: boolean;
};

// ---------------------------------------------------------------- helpers

const toPoint = (b: Business): LatLng => ({ latitude: b.lat, longitude: b.lng });

function boundingBox(route: LatLng[], marginM: number) {
  const lats = route.map((p) => p.latitude);
  const lngs = route.map((p) => p.longitude);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = marginM / 111320;
  const dLng = marginM / (111320 * Math.cos((midLat * Math.PI) / 180));
  return {
    minLat: Math.min(...lats) - dLat,
    maxLat: Math.max(...lats) + dLat,
    minLng: Math.min(...lngs) - dLng,
    maxLng: Math.max(...lngs) + dLng,
  };
}

function nearbyBusinesses(route: LatLng[], marginM: number): Business[] {
  const box = boundingBox(route, marginM);
  return BUSINESSES.filter(
    (b) => b.lat >= box.minLat && b.lat <= box.maxLat && b.lng >= box.minLng && b.lng <= box.maxLng
  );
}

// ---------------------------------------------------------------- scoring

/** Counts businesses that are open, bring people, and sit on the path when you reach them. */
export function openAlongRoute(route: LatLng[], departAt: Date = new Date()): OpenAlongRoute {
  if (route.length < 2) return { count: 0, perKm: 0, names: [] };

  // Distance walked by the start of each segment, to estimate when you pass each place.
  const walked = [0];
  for (let i = 1; i < route.length; i++) walked.push(walked[i - 1] + distanceBetween(route[i - 1], route[i]));
  const lengthM = walked[walked.length - 1];

  const names: string[] = [];
  for (const b of nearbyBusinesses(route, NEAR_ROUTE_M)) {
    const near = closestApproach(route, toPoint(b));
    if (near.d > NEAR_ROUTE_M) continue;
    const alongM = walked[near.seg] + distanceBetween(route[near.seg], near.point);
    const passAt = new Date(departAt.getTime() + (alongM / WALKING_SPEED_MPS) * 1000);
    if (isOpenForSafety(b, passAt)) names.push(b.name);
  }

  return { count: names.length, perKm: lengthM > 0 ? names.length / (lengthM / 1000) : 0, names };
}

// ---------------------------------------------------------------- brighter candidates

/** Centres of nearby blocks with several open places that the current path misses. */
function brightDetours(route: LatLng[], departAt: Date, zones: Zone[]): LatLng[] {
  const origin = route[0];
  const cosLat = Math.cos((origin.latitude * Math.PI) / 180);
  const cells = new Map<string, { lat: number; lng: number; n: number }>();

  // Rough "open around the middle of the walk" check is enough for picking candidates;
  // the final scoring uses exact pass times.
  const midWalk = new Date(departAt.getTime() + 5 * 60 * 1000);

  for (const b of nearbyBusinesses(route, CORRIDOR_M)) {
    if (!isOpenForSafety(b, midWalk)) continue;
    const d = closestApproach(route, toPoint(b)).d;
    if (d <= NEAR_ROUTE_M || d > CORRIDOR_M) continue;
    const x = Math.floor(((b.lng - origin.longitude) * 111320 * cosLat) / CELL_M);
    const y = Math.floor(((b.lat - origin.latitude) * 111320) / CELL_M);
    const key = `${x},${y}`;
    const cell = cells.get(key) ?? { lat: 0, lng: 0, n: 0 };
    cell.lat += b.lat;
    cell.lng += b.lng;
    cell.n += 1;
    cells.set(key, cell);
  }

  return [...cells.values()]
    .filter((c) => c.n >= MIN_CLUSTER)
    .map((c) => ({ point: { latitude: c.lat / c.n, longitude: c.lng / c.n }, n: c.n }))
    // never steer anyone toward a reported problem
    .filter((c) => zones.every((z) => distanceBetween(c.point, { latitude: z.lat, longitude: z.lng }) > z.radius_m + 30))
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_DETOURS)
    .map((c) => c.point);
}

// ---------------------------------------------------------------- main entry

/**
 * Drop-in replacement for routeAvoidingZones: same result shape, plus `open` and `brighter`.
 * 1. Shortest route that avoids reported problems (routeAvoidingZones).
 * 2. A few alternatives through nearby clusters of open businesses.
 * 3. Keep any that still avoid the zones and are ≤25% longer; pick the most open places per km.
 * Late at night when little is open, this simply returns the shortest safe route.
 */
export async function routeSafest(
  from: LatLng,
  to: LatLng,
  zones: Zone[],
  departAt: Date = new Date()
): Promise<SafestPlan> {
  const base = await routeAvoidingZones(from, to, zones);
  const baseOpen = openAlongRoute(base.route.points, departAt);

  // Straight-line fallback (no Google key) can't follow real streets, so there's nothing to compare.
  if (base.route.isFallback) return { ...base, open: baseOpen, brighter: false };

  const limitM = base.route.distanceM * MAX_LONGER;
  const mustAvoid = zones.filter((z) => !base.unavoidable.some((u) => u.id === z.id));

  let best: { route: WalkingRoute; open: OpenAlongRoute } = { route: base.route, open: baseOpen };

  for (const via of brightDetours(base.route.points, departAt, zones)) {
    let candidate: WalkingRoute;
    try {
      candidate = await getWalkingRoute(from, to, [via]);
    } catch {
      continue;
    }
    if (candidate.distanceM > limitM) continue;
    if (blockingZones(candidate.points, mustAvoid).length > 0) continue;

    const open = openAlongRoute(candidate.points, departAt);
    if (open.count > best.open.count && open.perKm > best.open.perKm * MIN_GAIN) {
      best = { route: candidate, open };
    }
  }

  return {
    ...base,
    route: best.route,
    addedM: Math.max(0, base.addedM + (best.route.distanceM - base.route.distanceM)),
    open: best.open,
    brighter: best.route !== base.route,
  };
}
