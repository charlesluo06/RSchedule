import { Bundle } from "../types.js";
import { CourseCodeOption, Subject, fetchCourseBundles, fetchCourseCodesForSubject, fetchSubjects } from "./ucrClient.js";
import {
  applySeats,
  extractSeatsByCrn,
  getCachedBundles,
  getCachedCourseCodes,
  getCachedSeats,
  getCachedSubjects,
  setCachedBundles,
  setCachedCourseCodes,
  setCachedSeats,
  setCachedSubjects,
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

/**
 * Powers the course-code autocomplete: cache-first list of every course
 * offered under a subject for a term. No seat-freshness concerns here (a
 * course's existence doesn't flicker minute to minute the way seats do), so
 * this is a simple cache-or-fetch, no forceRefresh/fallback complexity needed.
 */
export async function getCourseCodesForSubject(subject: string, termCode: string): Promise<CourseCodeOption[]> {
  const cached = await getCachedCourseCodes(subject, termCode);
  if (cached) return cached;

  const fresh = await fetchCourseCodesForSubject(subject, termCode);
  try {
    await setCachedCourseCodes(subject, termCode, fresh);
  } catch (err) {
    console.warn(`Failed to write course-codes cache for ${subject} (${termCode}); continuing with fresh data.`, err);
  }
  return fresh;
}

/** Cache-first list of every subject UCR offers for a term. */
export async function getSubjects(termCode: string): Promise<Subject[]> {
  const cached = await getCachedSubjects(termCode);
  if (cached) return cached;

  const fresh = await fetchSubjects(termCode);
  try {
    await setCachedSubjects(termCode, fresh);
  } catch (err) {
    console.warn(`Failed to write subjects cache for ${termCode}; continuing with fresh data.`, err);
  }
  return fresh;
}
