// Destination search for the plan screen.
// 1. Instant suggestions from data already in the app (free, offline): SJSU buildings and the
//    nearby places in src/data/businesses.json.
// 2. Any street address, through the phone's own geocoder (expo-location), kept near campus.

import * as Location from 'expo-location';

import cache from '@/data/businesses.json';
import { distanceBetween, type LatLng } from '@/lib/directions';
import { BUILDINGS } from '@/lib/eaiser';
import type { Business } from '@/lib/hours';

export type PlaceResult = LatLng & { id: string; name: string; detail: string };

const SJSU: LatLng = { latitude: 37.3352, longitude: -121.8811 };
const MAX_FROM_CAMPUS_M = 15000; // ignore address matches in other cities

const PLACES: PlaceResult[] = [
  ...BUILDINGS.map((b) => ({ id: `bldg:${b.name}`, name: b.name, detail: 'SJSU campus', latitude: b.latitude, longitude: b.longitude })),
  ...(cache as unknown as { businesses: Business[] }).businesses.map((b) => ({
    id: `place:${b.id}`,
    name: b.name,
    detail: b.type ? b.type.replace(/_/g, ' ') : 'Nearby place',
    latitude: b.lat,
    longitude: b.lng,
  })),
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const INDEX = PLACES.map((p) => ({ place: p, key: norm(p.name) }));

/** Instant matches by name: names that start with the query first, then campus buildings, then closest to campus. */
export function searchLocalPlaces(query: string, limit = 6): PlaceResult[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const words = q.split(' ');
  return INDEX.filter((e) => words.every((w) => e.key.includes(w)))
    .map((e) => ({
      place: e.place,
      rank:
        (e.key.startsWith(q) ? 0 : e.key.split(' ').some((w) => w.startsWith(words[0])) ? 1 : 2) * 10 +
        (e.place.id.startsWith('bldg:') ? 0 : 1),
      dist: distanceBetween(SJSU, e.place),
    }))
    .sort((a, b) => a.rank - b.rank || a.dist - b.dist)
    .slice(0, limit)
    // Distance from campus tells apart places with the same name (e.g. several 7-Elevens).
    .map((e) => (e.place.id.startsWith('bldg:') ? e.place : { ...e.place, detail: `${e.place.detail} · ${(e.dist / 1609).toFixed(1)} mi from campus` }));
}

/** Looks up a typed street address near campus. Returns null if nothing nearby matches. */
export async function geocodeNearCampus(query: string): Promise<PlaceResult | null> {
  const q = query.trim();
  if (q.length < 3) return null;
  const withCity = /san jos/i.test(q) ? q : `${q}, San Jose, CA`;
  const results = await Location.geocodeAsync(withCity);
  const near = results
    .map((r) => ({ latitude: r.latitude, longitude: r.longitude }))
    .filter((p) => distanceBetween(SJSU, p) <= MAX_FROM_CAMPUS_M)
    .sort((a, b) => distanceBetween(SJSU, a) - distanceBetween(SJSU, b))[0];
  return near ? { id: `addr:${q}`, name: q, detail: 'Address', ...near } : null;
}
