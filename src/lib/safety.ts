// Safety logic that runs on the phone: the emergency check, danger zones, and rerouting around them.
// Routes are private (AGENTS.md rule 4), so each phone checks and reroutes its OWN route; the server
// never has to look at anyone's path to warn them.

import { distanceBetween, getWalkingRoute, type LatLng, type WalkingRoute } from '@/lib/directions';
import type { EaiserResult } from '@/lib/eaiser';

// ---------------------------------------------------------------- emergency check
// EAiSER is for things that need fixing. Anything that sounds like someone in danger goes to
// UPD / 911 first. We ask one question instead of guessing, and never auto-dispatch anyone.
const EMERGENCY_WORDS =
  /\b(fight|fighting|assault|attack(ed|ing)?|harass(ed|ing|ment)?|follow(ed|ing) me|weapon|gun|knife|stab|bleed(ing)?|blood|unconscious|passed out|not breathing|can'?t breathe|overdose|seizure|hurt|injured|help me|scream(ing)?|robbed|robbery|fire|smoke)\b/i;

export function emergencyCheck(text: string, result?: EaiserResult | null) {
  const matched = text.match(EMERGENCY_WORDS)?.[0] ?? null;
  const fromEaiser = !!result && (result.category === 'fire_hazard' || (result.severity === 'high' && result.category === 'other'));
  return { askIfDanger: !!matched || fromEaiser, matched };
}

// ---------------------------------------------------------------- zones
export type Zone = {
  id: string;
  lat: number;
  lng: number;
  radius_m: number;
  title: string;
  category: string;
  severity: string;
};

const toXY = (p: LatLng, origin: LatLng) => ({
  x: (p.longitude - origin.longitude) * 111320 * Math.cos((origin.latitude * Math.PI) / 180),
  y: (p.latitude - origin.latitude) * 111320,
});
const fromXY = (x: number, y: number, origin: LatLng): LatLng => ({
  latitude: origin.latitude + y / 111320,
  longitude: origin.longitude + x / (111320 * Math.cos((origin.latitude * Math.PI) / 180)),
});

/** Closest approach of a route to a point: distance (m), segment index, and the closest point. */
export function closestApproach(route: LatLng[], p: LatLng) {
  let best = { d: Infinity, seg: 0, point: route[0] };
  for (let i = 1; i < route.length; i++) {
    const a = toXY(route[i - 1], p), b = toXY(route[i], p);
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / L2));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = Math.hypot(cx, cy);
    if (d < best.d) best = { d, seg: i - 1, point: fromXY(cx, cy, p) };
  }
  if (route.length === 1) best = { d: distanceBetween(route[0], p), seg: 0, point: route[0] };
  return best;
}

export function routeHitsZone(route: LatLng[], z: Zone, bufferM = 10) {
  if (route.length < 1) return false;
  return closestApproach(route, { latitude: z.lat, longitude: z.lng }).d < z.radius_m + bufferM;
}

export function blockingZones(route: LatLng[], zones: Zone[]) {
  return zones.filter((z) => routeHitsZone(route, z));
}

export function routeLength(route: LatLng[]) {
  let s = 0;
  for (let i = 1; i < route.length; i++) s += distanceBetween(route[i - 1], route[i]);
  return s;
}

/**
 * The route's points about `span` metres before and after `point`. At a corner the single segment the
 * zone sits on points along one street only, so the chord between these is a better local direction.
 */
function chordAround(route: LatLng[], seg: number, point: LatLng, span: number): [LatLng, LatLng] {
  let i = seg;
  let back = distanceBetween(point, route[i]);
  while (i > 0 && back < span) {
    back += distanceBetween(route[i], route[i - 1]);
    i--;
  }
  let j = Math.min(seg + 1, route.length - 1);
  let fwd = distanceBetween(point, route[j]);
  while (j < route.length - 1 && fwd < span) {
    fwd += distanceBetween(route[j], route[j + 1]);
    j++;
  }
  return [route[i], route[j]];
}

/**
 * Candidate waypoints `offset` metres from the zone centre on either side of the route, using two local
 * directions: the segment the zone sits on, and the chord across it (better at corners, where the
 * segment's sideways direction can point straight down the next street).
 */
function sideWaypoints(route: LatLng[], z: Zone, offset: number): LatLng[] {
  const c = { latitude: z.lat, longitude: z.lng };
  const { seg, point } = closestApproach(route, c);
  const p = toXY(point, c);
  // If the route passes right through the centre, offset from the centre; otherwise push outwards.
  const base = Math.hypot(p.x, p.y) < 1 ? { x: 0, y: 0 } : p;
  const directions: [LatLng, LatLng][] = [
    chordAround(route, seg, point, z.radius_m + 20),
    [route[seg], route[Math.min(seg + 1, route.length - 1)]],
  ];
  const out: LatLng[] = [];
  for (const [from, to] of directions) {
    const a = toXY(from, c), b = toXY(to, c);
    let nx = -(b.y - a.y), ny = b.x - a.x;
    const n = Math.hypot(nx, ny) || 1;
    nx /= n; ny /= n;
    for (const side of [1, -1]) {
      const w = fromXY(base.x + side * nx * offset, base.y + side * ny * offset, c);
      // Skip near-duplicates (on a straight street both directions agree).
      if (!out.some((o) => distanceBetween(o, w) < 15)) out.push(w);
    }
  }
  return out;
}

/** How far past the zone's edge to put detour waypoints; wider only if the closer ones don't clear it. */
const DETOUR_MARGINS_M = [35, 90, 160];

export type Avoidance = {
  route: WalkingRoute;
  avoided: Zone[];
  /** Zones we couldn't route around (e.g. the destination is inside one). */
  unavoidable: Zone[];
  addedM: number;
};

/**
 * Walking route from `from` to `to` that stays out of every zone it can.
 * Tries going around each blocking zone on both sides (widening the detour if needed) and keeps the
 * shortest route that clears it. `maxTries` caps how many zones it attempts.
 */
export async function routeAvoidingZones(from: LatLng, to: LatLng, zones: Zone[], maxTries = 3): Promise<Avoidance> {
  const direct = await getWalkingRoute(from, to);
  // Zones containing your start or destination can't be avoided; don't try.
  const avoidable = zones.filter(
    (z) => distanceBetween(from, { latitude: z.lat, longitude: z.lng }) > z.radius_m &&
           distanceBetween(to, { latitude: z.lat, longitude: z.lng }) > z.radius_m
  );
  const unavoidable = zones.filter((z) => !avoidable.includes(z) && routeHitsZone(direct.points, z));
  let best = direct;
  let via: LatLng[] = [];
  const avoided: Zone[] = [];
  for (let i = 0; i < maxTries; i++) {
    const hit = blockingZones(best.points, avoidable).find((z) => !avoided.includes(z) && !unavoidable.includes(z));
    if (!hit) break;
    let winner: { route: WalkingRoute; via: LatLng[] } | null = null;
    for (const margin of DETOUR_MARGINS_M) {
      for (const w of sideWaypoints(best.points, hit, hit.radius_m + margin)) {
        const candidateVia = insertInOrder(via, w, from);
        const r = await getWalkingRoute(from, to, candidateVia);
        // Must clear this zone without walking back into one already routed around.
        if (routeHitsZone(r.points, hit) || avoided.some((z) => routeHitsZone(r.points, z))) continue;
        if (!winner || r.distanceM < winner.route.distanceM) winner = { route: r, via: candidateVia };
      }
      if (winner) break;
    }
    // Can't get around this one; keep going so the other zones are still avoided.
    if (!winner) { unavoidable.push(hit); continue; }
    best = winner.route;
    via = winner.via;
    avoided.push(hit);
  }
  return { route: best, avoided, unavoidable, addedM: Math.max(0, best.distanceM - direct.distanceM) };
}

/** Keep detour waypoints ordered by distance from the start so the route doesn't zig-zag. */
function insertInOrder(via: LatLng[], w: LatLng, from: LatLng) {
  return [...via, w].sort((a, b) => distanceBetween(from, a) - distanceBetween(from, b));
}

export const CATEGORY_LABEL: Record<string, string> = {
  broken_lighting: 'broken lighting',
  blocked_path: 'a blocked walkway',
  flooding: 'flooding',
  construction: 'construction',
  fallen_tree: 'a fallen tree',
  fire_hazard: 'a fire hazard',
  unsafe_conditions: 'unsafe conditions',
  safety_concern: 'a safety concern (UPD notified)',
  other: 'a reported problem',
};
