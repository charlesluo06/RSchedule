import { Bundle } from "../types.js";
import {
  CourseCodeOption,
  Subject,
  fetchCourseBundles,
  fetchCourseCodesForSubject,
  fetchSectionAttributes,
  fetchSubjects,
} from "./ucrClient.js";
import {
  applySeats,
  extractSeatsByCrn,
  getCachedAttributes,
  getCachedBundles,
  getCachedCourseCodes,
  getCachedSeats,
  getCachedSubjects,
  setCachedAttributes,
  setCachedBundles,
  setCachedCourseCodes,
  setCachedSeats,
  setCachedSubjects,
} from "./cache.js";

/**
 * Thrown when a fetch from UCR itself fails, so routes can tell "UCR is down"
 * (502) apart from "something broke on our side" (500) — the frontend shows a
 * different message for each.
 */
export class UcrUnavailableError extends Error {
  constructor(cause: unknown) {
    super("UCR request failed");
    this.name = "UcrUnavailableError";
    this.cause = cause;
  }
}

async function fromUcr<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (err) {
    throw new UcrUnavailableError(err);
  }
}

/**
 * Cache reads fail open: if Redis is down or over quota, treat it as a cache
 * miss and go to UCR instead of failing the request. Slower and heavier on
 * UCR, but the student still gets live data rather than an error.
 */
async function readCache<T>(label: string, read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    console.warn(`Cache read failed for ${label}; treating as a miss.`, err);
    return null;
  }
}

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
export function getCourseBundles(courseCode: string, termCode: string, forceRefresh = false): Promise<Bundle[]> {
  // Identical requests that arrive while one is still running share its
  // result instead of each queueing their own live UCR search (searches run
  // one at a time per term, so duplicates would just make everyone wait).
  // forceRefresh is part of the key so a forced refresh is never answered by
  // an in-flight lookup that might have been served from cache. In-memory, so
  // this only dedupes within one server instance.
  const key = `${termCode}:${courseCode}:${forceRefresh}`;
  const existing = inFlightBundles.get(key);
  if (existing) return existing;

  const request = loadCourseBundles(courseCode, termCode, forceRefresh).finally(() => {
    inFlightBundles.delete(key);
  });
  inFlightBundles.set(key, request);
  return request;
}

const inFlightBundles = new Map<string, Promise<Bundle[]>>();

async function loadCourseBundles(courseCode: string, termCode: string, forceRefresh: boolean): Promise<Bundle[]> {
  const [cachedBundles, cachedSeats] = await Promise.all([
    readCache(`bundles ${courseCode} (${termCode})`, () => getCachedBundles(courseCode, termCode)),
    readCache(`seats ${courseCode} (${termCode})`, () => getCachedSeats(courseCode, termCode)),
  ]);

  // Both caches still fresh: no need to touch UCR at all — unless the
  // caller explicitly asked to bypass this and get truly live data.
  if (!forceRefresh && cachedBundles && cachedSeats) {
    return applySeats(cachedBundles, cachedSeats);
  }

  let freshBundles: Bundle[];
  try {
    freshBundles = await fromUcr(fetchCourseBundles(courseCode, termCode));
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
  const cached = await readCache(`course-codes ${subject} (${termCode})`, () => getCachedCourseCodes(subject, termCode));
  if (cached) return cached;

  const fresh = await fromUcr(fetchCourseCodesForSubject(subject, termCode));
  try {
    await setCachedCourseCodes(subject, termCode, fresh);
  } catch (err) {
    console.warn(`Failed to write course-codes cache for ${subject} (${termCode}); continuing with fresh data.`, err);
  }
  return fresh;
}

/** Cache-first list of every subject UCR offers for a term. */
export async function getSubjects(termCode: string): Promise<Subject[]> {
  const cached = await readCache(`subjects (${termCode})`, () => getCachedSubjects(termCode));
  if (cached) return cached;

  const fresh = await fromUcr(fetchSubjects(termCode));
  try {
    await setCachedSubjects(termCode, fresh);
  } catch (err) {
    console.warn(`Failed to write subjects cache for ${termCode}; continuing with fresh data.`, err);
  }
  return fresh;
}

/** Cache-first list of GE/breadth requirements a section fulfills. */
export async function getSectionAttributes(crn: string, termCode: string): Promise<string[]> {
  const cached = await readCache(`attributes CRN ${crn} (${termCode})`, () => getCachedAttributes(crn, termCode));
  if (cached) return cached;

  const fresh = await fromUcr(fetchSectionAttributes(crn, termCode));
  try {
    await setCachedAttributes(crn, termCode, fresh);
  } catch (err) {
    console.warn(`Failed to write attributes cache for CRN ${crn} (${termCode}); continuing with fresh data.`, err);
  }
  return fresh;
}
