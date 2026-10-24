// Which open businesses actually make a street safer: places that bring light and people
// to the sidewalk, not offices, empty lots, or listings that claim 24/7 for phone hours.

import { isOpenAt, type Business } from '@/lib/hours';

const PEOPLE_TYPES = new Set([
  'restaurant', 'cafe', 'coffee_shop', 'bakery', 'bar', 'pub', 'wine_bar', 'night_club',
  'dessert_shop', 'ice_cream_shop', 'juice_shop', 'tea_house', 'deli', 'food_court',
  'meal_takeaway', 'fast_food_restaurant', 'bagel_shop', 'donut_shop', 'sandwich_shop',
  'convenience_store', 'gas_station', 'supermarket', 'grocery_store', 'liquor_store',
  'pharmacy', 'drugstore', 'hotel', 'motel', 'hostel', 'gym', 'fitness_center',
  'laundry', 'movie_theater', 'bowling_alley', 'karaoke', 'casino',
  'performing_arts_theater', 'concert_hall', 'shopping_mall', 'library',
  'hospital', 'police', 'fire_station',
]);

// Covers the many specific kinds (mexican_restaurant, book_store, cocktail_bar…).
const PEOPLE_SUFFIXES = ['_restaurant', '_store', '_shop', '_bar'];

// Types where "open 24 hours" is believable; any other type claiming 24/7 is ignored.
const REAL_24H_TYPES = new Set([
  'gas_station', 'convenience_store', 'hotel', 'motel', 'hostel', 'hospital', 'police',
  'fire_station', 'laundry', 'gym', 'fitness_center', 'supermarket', 'grocery_store',
  'pharmacy', 'drugstore', 'fast_food_restaurant', 'restaurant', 'diner', 'casino',
]);

export function bringsPeople(b: Business): boolean {
  if (!b.type) return false;
  if (PEOPLE_TYPES.has(b.type)) return true;
  return PEOPLE_SUFFIXES.some((s) => b.type!.endsWith(s));
}

const isListed24h = (b: Business) => b.periods.some((p) => !p.close);

/** Open at this time AND actually adds light and people to the street. */
export function isOpenForSafety(b: Business, date: Date = new Date()): boolean {
  if (!bringsPeople(b)) return false;
  if (isListed24h(b) && !REAL_24H_TYPES.has(b.type!)) return false;
  return isOpenAt(b, date);
}
