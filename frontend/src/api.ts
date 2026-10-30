import type { Bundle, BusyBlock, CourseCodeOption, GenerateResponse, Preferences, Subject, Term } from "./types";

// Locally, Vite's dev proxy forwards same-origin paths like "/terms" to the
// backend on :3001 (see vite.config.ts), so this stays "" and requests never
// leave the page's own origin. In production the frontend and backend are
// separate Vercel deployments (different domains), so this needs to point
// at the backend's actual URL — set via VITE_API_BASE_URL at build time.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

// 429 is checked before the generic !response.ok fallback everywhere the
// backend can return it (i.e. everywhere — the rate limiter applies
// globally) so a throttled request surfaces a clear "slow down" message
// instead of whichever generic "failed to load X" text that call happens to
// throw otherwise.
function assertNotRateLimited(response: Response) {
  if (response.status === 429) {
    throw new Error("You're making requests too quickly. Please wait a moment and try again.");
  }
}

// fetch only rejects when the request never got a response (offline, DNS,
// blocked, server unreachable), and its message is browser-specific noise
// like "Failed to fetch" / "Load failed". Swap it for something a student
// can act on.
async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Couldn't reach RSchedule. Check your internet connection and try again.");
  }
}

export async function getTerms(): Promise<Term[]> {
  const response = await request(`${API_BASE}/terms`);
  assertNotRateLimited(response);
  if (!response.ok) {
    throw new Error("Failed to load terms from UCR.");
  }
  return response.json();
}

export async function getSubjects(termCode: string): Promise<Subject[]> {
  const params = new URLSearchParams({ term: termCode });
  const response = await request(`${API_BASE}/subjects?${params}`);
  assertNotRateLimited(response);
  if (!response.ok) {
    throw new Error("Failed to load subjects.");
  }
  return response.json();
}

export async function getCourseCodesForSubject(subject: string, termCode: string): Promise<CourseCodeOption[]> {
  const params = new URLSearchParams({ subject, term: termCode });
  const response = await request(`${API_BASE}/course-codes?${params}`);
  assertNotRateLimited(response);
  if (!response.ok) {
    throw new Error("Failed to load course codes.");
  }
  return response.json();
}

export async function getSectionAttributes(crn: string, termCode: string): Promise<string[]> {
  const params = new URLSearchParams({ crn, term: termCode });
  const response = await request(`${API_BASE}/section-attributes?${params}`);
  assertNotRateLimited(response);
  if (!response.ok) {
    throw new Error("Failed to load section attributes.");
  }
  return response.json();
}

export async function postCourses(
  courseCodes: string[],
  termCode: string,
  forceRefresh = false,
): Promise<Record<string, Bundle[]>> {
  const response = await request(`${API_BASE}/courses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseCodes, termCode, forceRefresh }),
  });

  assertNotRateLimited(response);
  if (response.status === 502) {
    // Matches the backend's own distinction: 502 specifically means UCR
    // itself (not our server) failed, so the message should say so.
    throw new Error("UCR's registration system appears to be down right now. Please try again shortly.");
  }
  if (response.status === 504) {
    // Vercel killed the function at its max duration — almost always a cold
    // UCR search on a big course list, which is cached by the time they retry.
    throw new Error("That took too long. Please try again — it's usually faster the second time.");
  }
  if (response.status === 500) {
    // The backend returns 500 (not 502) when the failure was on our side
    // rather than UCR's, so don't blame UCR for it.
    throw new Error("Something went wrong on our side. Please try again shortly.");
  }
  if (!response.ok) {
    throw new Error("Failed to fetch course data.");
  }
  return response.json();
}

// No network call to UCR happens here — this is pure computation on data
// already fetched via postCourses, which is exactly why it's safe to call
// repeatedly (e.g. every time the user tweaks a preference) without worrying
// about UCR rate limits. It's still subject to our OWN rate limit, though.
export async function postGenerate(
  courseBundles: Record<string, Bundle[]>,
  preferences: Preferences,
  busyBlocks: BusyBlock[] = [],
): Promise<GenerateResponse> {
  const response = await request(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseBundles, preferences, busyBlocks }),
  });
  assertNotRateLimited(response);
  if (!response.ok) {
    throw new Error("Failed to generate schedules.");
  }
  return response.json();
}
