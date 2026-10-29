import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Per-IP, so this has to cover everyone sharing one public IP (dorm floors,
// libraries, campus NAT), not just one student. A single active session runs
// ~15-25 requests/min (bursts of ~100: autofill keystrokes, a
// /section-attributes call per class clicked, and a live /generate re-run on
// every busy-block edit), so 600 covers roughly 25-40 simultaneously active
// students behind one IP while still capping a scripted flood. Overridable
// via RATE_LIMIT_MAX so it can be tuned from the Vercel dashboard during
// registration week without a code change.
const WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 600;

function readMaxRequests(): number {
  const parsed = Number(process.env.RATE_LIMIT_MAX);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_REQUESTS_PER_WINDOW;
}

const MAX_REQUESTS_PER_WINDOW = readMaxRequests();

/**
 * Basic fixed-window rate limit, keyed per client IP, backed by Redis so it
 * works correctly across Vercel's multiple serverless instances (an
 * in-memory counter wouldn't be shared between them). Returns true if the
 * request should be allowed.
 *
 * Fails open: if Redis is unreachable or over quota, the request is allowed
 * rather than letting the error escape — Express 4 doesn't catch rejections
 * from async middleware, so a thrown error here would hang the request and
 * take down every route, including ones that never touch Redis.
 */
export async function isWithinRateLimit(ip: string): Promise<boolean> {
  try {
    const key = `ratelimit:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) {
      // First request in a fresh window — start the window's expiry now.
      await redis.expire(key, WINDOW_SECONDS);
    }
    return count <= MAX_REQUESTS_PER_WINDOW;
  } catch (err) {
    console.error("Rate limiter unavailable, allowing request:", err);
    return true;
  }
}
