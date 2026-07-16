import { Redis } from "@upstash/redis";
import { Bundle, Section } from "../types.js";

const redis = Redis.fromEnv();

// Section/meeting-time data rarely changes once a term is published, so we
// can hold onto it for hours. Seat counts change constantly, especially
// during registration windows, so those get a much shorter shelf life.
const BUNDLES_TTL_SECONDS = 6 * 60 * 60; // 6 hours
const SEATS_TTL_SECONDS = 3 * 60; // 3 minutes

function bundlesKey(courseCode: string, termCode: string): string {
  return `bundles:${termCode}:${courseCode}`;
}

function seatsKey(courseCode: string, termCode: string): string {
  return `seats:${termCode}:${courseCode}`;
}

export async function getCachedBundles(courseCode: string, termCode: string): Promise<Bundle[] | null> {
  return redis.get<Bundle[]>(bundlesKey(courseCode, termCode));
}

export async function setCachedBundles(courseCode: string, termCode: string, bundles: Bundle[]): Promise<void> {
  await redis.set(bundlesKey(courseCode, termCode), bundles, { ex: BUNDLES_TTL_SECONDS });
}

export async function getCachedSeats(courseCode: string, termCode: string): Promise<Record<string, number> | null> {
  return redis.get<Record<string, number>>(seatsKey(courseCode, termCode));
}

export async function setCachedSeats(
  courseCode: string,
  termCode: string,
  seatsByCrn: Record<string, number>,
): Promise<void> {
  await redis.set(seatsKey(courseCode, termCode), seatsByCrn, { ex: SEATS_TTL_SECONDS });
}

export function extractSeatsByCrn(bundles: Bundle[]): Record<string, number> {
  const seatsByCrn: Record<string, number> = {};
  for (const bundle of bundles) {
    for (const section of bundle.sections) {
      seatsByCrn[section.crn] = section.seatsAvailable;
    }
  }
  return seatsByCrn;
}

export function applySeats(bundles: Bundle[], seatsByCrn: Record<string, number>): Bundle[] {
  return bundles.map((bundle) => ({
    ...bundle,
    sections: bundle.sections.map((section): Section => ({
      ...section,
      seatsAvailable: seatsByCrn[section.crn] ?? section.seatsAvailable,
    })),
  }));
}
