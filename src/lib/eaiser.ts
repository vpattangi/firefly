// EAiSER for Campuses adapter.
//
// EAiSER takes a photo + a few words and returns: issue type, title, description, severity, campus
// building, where the report goes, and a status. We don't have API access yet, so:
//   * if EXPO_PUBLIC_EAISER_URL is set, we call it (request/response shape below is our best guess;
//     adjust `toResult` once MomntumAI shares the real schema);
//   * otherwise we run a small on-device stand-in with the same output shape, clearly marked
//     `simulated: true` everywhere it shows up.
// Everything else in the app only talks to `classifyReport`, so swapping in the real API is one file.
// Production note: call EAiSER from a Supabase Edge Function so the key never ships in the app.

import { distanceBetween, type LatLng } from '@/lib/directions';

export type IncidentCategory =
  | 'broken_lighting'
  | 'blocked_path'
  | 'flooding'
  | 'construction'
  | 'fallen_tree'
  | 'fire_hazard'
  | 'unsafe_conditions'
  | 'safety_concern'
  | 'other';

export type Severity = 'low' | 'medium' | 'high';
export type EaiserStatus = 'submitted' | 'in_progress' | 'resolved';

export type EaiserResult = {
  id: string;
  issueType: string;
  category: IncidentCategory;
  title: string;
  description: string;
  severity: Severity;
  building: string | null;
  routeTo: string;
  status: EaiserStatus;
  simulated: boolean;
};

export type ReportInput = {
  text: string;
  photoBase64?: string | null;
  location: LatLng;
};

const EAISER_URL = process.env.EXPO_PUBLIC_EAISER_URL;
const EAISER_KEY = process.env.EXPO_PUBLIC_EAISER_KEY;

const FACILITIES = 'SJSU Facilities Development & Operations';
const UPD = 'SJSU University Police (UPD)';

export async function classifyReport(input: ReportInput): Promise<EaiserResult> {
  if (EAISER_URL) {
    try {
      const res = await fetch(`${EAISER_URL.replace(/\/$/, '')}/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(EAISER_KEY ? { authorization: `Bearer ${EAISER_KEY}` } : {}) },
        body: JSON.stringify({
          campus: 'sjsu',
          description: input.text,
          image_base64: input.photoBase64 ?? undefined,
          latitude: input.location.latitude,
          longitude: input.location.longitude,
        }),
      });
      if (!res.ok) throw new Error(`EAiSER ${res.status}`);
      return toResult(await res.json(), input);
    } catch {
      // Fall through to the stand-in so a demo never dead-ends; the result is marked simulated.
    }
  }
  return simulate(input);
}

/** Map EAiSER's response onto our shape. Field names are guesses until we see the real API. */
function toResult(j: Record<string, any>, input: ReportInput): EaiserResult {
  const issueType = String(j.issue_type ?? j.type ?? j.category ?? 'Something Else');
  const local = simulate(input);
  const sev = String(j.severity ?? '').toLowerCase();
  return {
    id: String(j.id ?? j.report_id ?? local.id),
    issueType,
    category: categoryFromIssueType(issueType) ?? local.category,
    title: String(j.title ?? local.title),
    description: String(j.description ?? local.description),
    severity: sev === 'low' || sev === 'medium' || sev === 'high' ? sev : local.severity,
    building: j.building ?? local.building,
    routeTo: String(j.destination ?? j.route_to ?? j.department ?? local.routeTo),
    status: j.status === 'in_progress' || j.status === 'resolved' ? j.status : 'submitted',
    simulated: false,
  };
}

function categoryFromIssueType(t: string): IncidentCategory | null {
  const s = t.toLowerCase();
  if (/light|lamp/.test(s)) return 'broken_lighting';
  if (/flood|water|leak/.test(s)) return 'flooding';
  if (/tree|branch/.test(s)) return 'fallen_tree';
  if (/construct/.test(s)) return 'construction';
  if (/fire|smoke/.test(s)) return 'fire_hazard';
  if (/block|obstruct|sidewalk|path/.test(s)) return 'blocked_path';
  return null;
}

// ---------------------------------------------------------------- on-device stand-in (simulated)
const RULES: { category: IncidentCategory; issueType: string; title: string; words: RegExp; severity: Severity }[] = [
  { category: 'fire_hazard', issueType: 'Fire / Smoke', title: 'Fire or smoke reported', words: /\b(fire|smoke|burning|flames?)\b/i, severity: 'high' },
  { category: 'broken_lighting', issueType: 'Broken Streetlight', title: 'Broken or missing lighting', words: /\b(light|lights|lamp|dark|unlit|pitch black|streetlight)\b/i, severity: 'medium' },
  { category: 'flooding', issueType: 'Flooding', title: 'Flooded walkway', words: /\b(flood|flooded|water|puddle|leak|sprinkler)\b/i, severity: 'medium' },
  { category: 'fallen_tree', issueType: 'Fallen Tree', title: 'Fallen tree or branch', words: /\b(tree|branch|branches)\b/i, severity: 'medium' },
  { category: 'construction', issueType: 'Construction', title: 'Construction blocking the way', words: /\b(construction|fence|fenced|scaffold|crew|closed for)\b/i, severity: 'low' },
  { category: 'blocked_path', issueType: 'Blocked Sidewalk', title: 'Blocked walkway', words: /\b(blocked|block|closed|obstruct|scooters?|debris|can'?t get through)\b/i, severity: 'low' },
  { category: 'unsafe_conditions', issueType: 'Something Else', title: 'Unsafe conditions', words: /\b(broken glass|glass|hole|uneven|slippery|wire|wires|sparking)\b/i, severity: 'medium' },
];

// Approximate SJSU building positions, only for labelling simulated results.
export const BUILDINGS: (LatLng & { name: string })[] = [
  { name: 'Dr. Martin Luther King Jr. Library', latitude: 37.33553, longitude: -121.88502 },
  { name: 'Student Union', latitude: 37.33525, longitude: -121.8812 },
  { name: 'Engineering Building', latitude: 37.33711, longitude: -121.8818 },
  { name: 'Spartan Recreation & Aquatic Center', latitude: 37.3344, longitude: -121.8796 },
  { name: 'Clark Hall', latitude: 37.3361, longitude: -121.8828 },
  { name: 'Duncan Hall', latitude: 37.3326, longitude: -121.882 },
  { name: 'Joe West Hall', latitude: 37.3345, longitude: -121.8775 },
  { name: 'Campus Village', latitude: 37.3339, longitude: -121.8784 },
  { name: '7th Street Garage', latitude: 37.3329, longitude: -121.8806 },
];

function nearestBuilding(p: LatLng): string | null {
  let best: { name: string; d: number } | null = null;
  for (const b of BUILDINGS) {
    const d = distanceBetween(p, b);
    if (!best || d < best.d) best = { name: b.name, d };
  }
  return best && best.d < 150 ? best.name : null;
}

function simulate(input: ReportInput): EaiserResult {
  const rule = RULES.find((r) => r.words.test(input.text));
  const category = rule?.category ?? 'other';
  const urgentWords = /\b(very|really|completely|totally|huge|dangerous|everyone|pitch)\b/i.test(input.text);
  const severity: Severity = rule ? (urgentWords && rule.severity !== 'high' ? bump(rule.severity) : rule.severity) : 'low';
  const building = nearestBuilding(input.location);
  return {
    id: `sim-${Date.now().toString(36)}`,
    issueType: rule?.issueType ?? 'Something Else',
    category,
    title: rule?.title ?? 'Campus issue reported',
    description: input.text.trim().slice(0, 280) || (rule?.title ?? 'Reported by a student'),
    severity,
    building,
    routeTo: category === 'fire_hazard' ? `${UPD} and ${FACILITIES}` : FACILITIES,
    status: 'submitted',
    simulated: true,
  };
}

function bump(s: Severity): Severity {
  return s === 'low' ? 'medium' : 'high';
}
