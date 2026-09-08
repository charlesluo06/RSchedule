import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Generous enough for real usage — a normal session firing several autofill
// lookups plus /courses and a few /generate calls while tweaking preferences
// easily adds up to 15-25 requests in a minute. This is meant to catch
// scripted/abusive traffic, not normal browsing.
//
// Raised from 60 -> 100 after a real session tripped it during normal use:
// busy-block editing added a new source of /generate calls (every add/
// remove/tweak on the results page re-generates live), on top of autofill's
// existing per-keystroke /subjects+/course-codes calls and a
// /section-attributes call per class clicked — a single active session
// legitimately clustering many actions in under a minute adds up faster
// than the original estimate assumed.
const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 100;

/**
 * Basic fixed-window rate limit, keyed per client IP, backed by Redis so it
 * works correctly across Vercel's multiple serverless instances (an
 * in-memory counter wouldn't be shared between them). Returns true if the
 * request should be allowed.
 */
export async function isWithinRateLimit(ip: string): Promise<boolean> {
  const key = `ratelimit:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    // First request in a fresh window — start the window's expiry now.
    await redis.expire(key, WINDOW_SECONDS);
  }
  return count <= MAX_REQUESTS_PER_WINDOW;
}
