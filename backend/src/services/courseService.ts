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
 *
 * `forceRefresh` skips the fast-path shortcut below (returning cached data
 * without touching UCR) — for a student watching seats during a
 * registration rush, the 3-minute seat TTL can be too slow, and there's no
 * way to ask UCR for just seat counts, so a full re-fetch is the only way
 * to get truly live numbers. The cache is still read up front, though, so
 * if the forced UCR fetch itself fails, we can still fall back to it rather
 * than failing outright — "give me fresher data" shouldn't mean "or nothing
 * at all" if the fresher attempt hits a snag.
 */
export async function getCourseBundles(
  courseCode: string,
  termCode: string,
  forceRefresh = false,
): Promise<Bundle[]> {
  const [cachedBundles, cachedSeats] = await Promise.all([
    getCachedBundles(courseCode, termCode),
    getCachedSeats(courseCode, termCode),
  ]);

  // Both caches still fresh: no need to touch UCR at all — unless the
  // caller explicitly asked to bypass this and get truly live data.
  if (!forceRefresh && cachedBundles && cachedSeats) {
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
