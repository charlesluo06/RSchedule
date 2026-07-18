import type { Bundle, CourseCodeOption, GenerateResponse, Preferences, Subject, Term } from "./types";

// Locally, Vite's dev proxy forwards same-origin paths like "/terms" to the
// backend on :3001 (see vite.config.ts), so this stays "" and requests never
// leave the page's own origin. In production the frontend and backend are
// separate Vercel deployments (different domains), so this needs to point
// at the backend's actual URL — set via VITE_API_BASE_URL at build time.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function getTerms(): Promise<Term[]> {
  const response = await fetch(`${API_BASE}/terms`);
  if (!response.ok) {
    throw new Error("Failed to load terms from UCR.");
  }
  return response.json();
}

export async function getSubjects(termCode: string): Promise<Subject[]> {
  const params = new URLSearchParams({ term: termCode });
  const response = await fetch(`${API_BASE}/subjects?${params}`);
  if (!response.ok) {
    throw new Error("Failed to load subjects.");
  }
  return response.json();
}

export async function getCourseCodesForSubject(subject: string, termCode: string): Promise<CourseCodeOption[]> {
  const params = new URLSearchParams({ subject, term: termCode });
  const response = await fetch(`${API_BASE}/course-codes?${params}`);
  if (!response.ok) {
    throw new Error("Failed to load course codes.");
  }
  return response.json();
}

export async function postCourses(
  courseCodes: string[],
  termCode: string,
  forceRefresh = false,
): Promise<Record<string, Bundle[]>> {
  const response = await fetch(`${API_BASE}/courses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseCodes, termCode, forceRefresh }),
  });

  if (response.status === 502) {
    // Matches the backend's own distinction: 502 specifically means UCR
    // itself (not our server) failed, so the message should say so.
    throw new Error("UCR's registration system appears to be down right now. Please try again shortly.");
  }
  if (!response.ok) {
    throw new Error("Failed to fetch course data.");
  }
  return response.json();
}

// No network call to UCR happens here — this is pure computation on data
// already fetched via postCourses, which is exactly why it's safe to call
// repeatedly (e.g. every time the user tweaks a preference) without worrying
// about UCR rate limits.
export async function postGenerate(
  courseBundles: Record<string, Bundle[]>,
  preferences: Preferences,
): Promise<GenerateResponse> {
  const response = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseBundles, preferences }),
  });
  if (!response.ok) {
    throw new Error("Failed to generate schedules.");
  }
  return response.json();
}
