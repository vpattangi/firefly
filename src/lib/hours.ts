// Opening-hours check for cached Google Places data (src/data/businesses.json).
// Google's day numbers match JavaScript: 0 = Sunday … 6 = Saturday. Times are the phone's local time.

export type HoursPoint = { day?: number; hour?: number; minute?: number };
export type Period = { open: HoursPoint; close?: HoursPoint };
export type Business = {
  id: string;
  name: string;
  type: string | null;
  lat: number;
  lng: number;
  periods: Period[];
};

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

// Google leaves out fields that are 0 (Sunday, midnight), so default each one to 0.
function toWeekMinute(p: HoursPoint): number {
  return (p.day ?? 0) * MINUTES_PER_DAY + (p.hour ?? 0) * 60 + (p.minute ?? 0);
}

export function isOpenAt(business: Business, date: Date = new Date()): boolean {
  const periods = business.periods;
  if (!periods || periods.length === 0) return false;

  const now = date.getDay() * MINUTES_PER_DAY + date.getHours() * 60 + date.getMinutes();

  for (const period of periods) {
    if (!period.close) return true; // no close time = open 24/7
    const start = toWeekMinute(period.open);
    let end = toWeekMinute(period.close);
    if (end <= start) end += MINUTES_PER_WEEK; // wraps past Saturday night
    if ((now >= start && now < end) || (now + MINUTES_PER_WEEK >= start && now + MINUTES_PER_WEEK < end)) {
      return true;
    }
  }
  return false;
}
