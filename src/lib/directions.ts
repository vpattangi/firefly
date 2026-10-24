export type LatLng = { latitude: number; longitude: number };

export type WalkingRoute = {
  points: LatLng[];
  distanceM: number;
  durationS: number;
  /** True when no Google key is configured and we drew a straight line instead. */
  isFallback: boolean;
};

const googleKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const WALKING_SPEED_MPS = 1.35;

/** `via` points are pass-through waypoints (used to detour around reported problems). */
export async function getWalkingRoute(from: LatLng, to: LatLng, via: LatLng[] = []): Promise<WalkingRoute> {
  if (!googleKey) {
    const points = [from, ...via, to];
    let distanceM = 0;
    for (let i = 1; i < points.length; i++) distanceM += distanceBetween(points[i - 1], points[i]);
    return {
      points,
      distanceM,
      durationS: distanceM / WALKING_SPEED_MPS,
      isFallback: true,
    };
  }

  // Google Routes API (the legacy Directions API can't be enabled on new Cloud projects).
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: { location: { latLng: from } },
      destination: { location: { latLng: to } },
      // Pass-through points (no stop) used to detour around reported problems.
      ...(via.length ? { intermediates: via.map((p) => ({ via: true, location: { latLng: p } })) } : {}),
      travelMode: 'WALK',
    }),
  });
  const json = await res.json();
  const route = json.routes?.[0];
  if (!res.ok || !route) {
    throw new Error(json.error?.message ?? 'Could not find a walking route');
  }

  return {
    points: decodePolyline(route.polyline.encodedPolyline),
    distanceM: route.distanceMeters,
    durationS: parseFloat(route.duration), // e.g. "742s"
    isFallback: false,
  };
}

/** Google encoded polyline → coordinates. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const axis of ['lat', 'lng'] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 'lat') lat += delta;
      else lng += delta;
    }
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/** Coordinates in the [lng, lat] order PostGIS / GeoJSON expects. */
export function toGeoJsonCoordinates(points: LatLng[]): [number, number][] {
  return points.map((p) => [p.longitude, p.latitude]);
}

export function fromGeoJsonCoordinates(coords: [number, number][] | null | undefined): LatLng[] {
  return (coords ?? []).map(([longitude, latitude]) => ({ latitude, longitude }));
}

export function distanceBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return miles < 0.1 ? `${Math.round(meters * 3.281)} ft` : `${miles.toFixed(1)} mi`;
}

export function formatDuration(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
