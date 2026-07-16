import { Bundle } from "../types.js";
import { fetchCourseBundles } from "./ucrClient.js";
import {
  applySeats,
  extractSeatsByCrn,
  getCachedBundles,
  getCachedSeats,
  setCachedBundles,
  setCachedSeats,
} from "./cache.js";

/**
 * The single entry point the /courses endpoint should call. Handles the
 * cache-first logic and falls back to serving stale cached data (rather
 * than failing outright) if UCR is unreachable when we need fresh data.
 */
export async function getCourseBundles(courseCode: string, termCode: string): Promise<Bundle[]> {
  const [cachedBundles, cachedSeats] = await Promise.all([
    getCachedBundles(courseCode, termCode),
    getCachedSeats(courseCode, termCode),
  ]);

  // Both caches still fresh: no need to touch UCR at all.
  if (cachedBundles && cachedSeats) {
    return applySeats(cachedBundles, cachedSeats);
  }

  let freshBundles: Bundle[];
  try {
    freshBundles = await fetchCourseBundles(courseCode, termCode);
  } catch (err) {
    if (cachedBundles) {
      console.warn(`UCR fetch failed for ${courseCode} (${termCode}); serving stale cached data.`, err);
      return cachedSeats ? applySeats(cachedBundles, cachedSeats) : cachedBundles;
    }
    throw err;
  }

  // A cache-write failure (e.g. Redis briefly unavailable) shouldn't fail
  // the request when we already have good, fresh data from UCR in hand.
  try {
    const seatsByCrn = extractSeatsByCrn(freshBundles);
    await Promise.all([
      setCachedBundles(courseCode, termCode, freshBundles),
      setCachedSeats(courseCode, termCode, seatsByCrn),
    ]);
  } catch (err) {
    console.warn(`Failed to write cache for ${courseCode} (${termCode}); continuing with fresh data.`, err);
  }

  return freshBundles;
}
