// Answers a real question, not a rhetorical one: does generateSchedules
// actually consider every combination of course bundles, or could its
// most-constrained-first ordering / pruning / dedup silently drop a valid
// one? This is a differential test against a completely independent,
// naive brute-force reference (plain nested loops, its own from-scratch
// overlap check) — if the real search and the brute-force reference ever
// disagree on which combinations are valid, this test fails.
//
// Uses a small seeded PRNG (not Math.random()) so a failure is
// reproducible — rerunning prints the same scenario instead of a
// different random one each time.
import { describe, expect, it } from "vitest";
import { generateSchedules } from "./scheduler.js";
import { Bundle, BusyBlock, DayOfWeek, Meeting } from "../types.js";

// mulberry32 — tiny, deterministic, good enough for test-data generation.
function makeRng(seed: number) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function randomMeeting(rng: () => number): Meeting {
  const day = DAYS[Math.floor(rng() * DAYS.length)];
  // Start hour deliberately narrow (8am-1pm) and duration coarse (50 or 80
  // min) so random sections actually collide with real frequency instead
  // of almost never overlapping by chance — a search that's secretly
  // dropping valid combinations is much easier to catch when there's
  // real contention to get wrong.
  const startHour = 8 + Math.floor(rng() * 5);
  const startMin = rng() < 0.5 ? 0 : 30;
  const durationMin = rng() < 0.5 ? 50 : 80;
  const totalStart = startHour * 60 + startMin;
  const totalEnd = totalStart + durationMin;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return { day, startTime: fmt(totalStart), endTime: fmt(totalEnd), building: "B", room: "1" };
}

let crnCounter = 0;
function randomBundle(courseCode: string, rng: () => number): Bundle {
  crnCounter += 1;
  return {
    courseCode,
    sections: [
      {
        crn: String(crnCounter),
        courseCode,
        sectionType: "Lecture",
        linkId: null,
        meetings: [randomMeeting(rng)],
        seatsAvailable: rng() < 0.1 ? 0 : 10, // occasionally full, exercising hasOpenSeats
        maximumEnrollment: 30,
        creditHours: 4,
        instructor: "Prof X",
      },
    ],
  };
}

function randomCourseBundles(numCourses: number, bundlesPerCourse: number, rng: () => number): Record<string, Bundle[]> {
  const result: Record<string, Bundle[]> = {};
  for (let c = 0; c < numCourses; c++) {
    const courseCode = `COURSE${c}`;
    result[courseCode] = Array.from({ length: bundlesPerCourse }, () => randomBundle(courseCode, rng));
  }
  return result;
}

// Independent, from-scratch overlap check — deliberately not calling
// anything from scheduler.ts, so a bug shared between "real" and
// "reference" implementations can't hide from this test.
function referenceOverlap(a: Meeting, b: Meeting): boolean {
  if (a.day !== b.day) return false;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);
}

// Plain nested-loop brute force over the full Cartesian product of bundles
// (one per course) — the simplest possible correct implementation, so its
// own correctness is easy to eyeball. Returns the set of valid schedules
// as sorted-CRN-string keys, identical in shape to scheduler.ts's own
// scheduleKey so the two can be diffed directly.
function bruteForceValidSchedules(
  courseBundles: Record<string, Bundle[]>,
  busyMeetings: Meeting[],
): Set<string> {
  const courseCodes = Object.keys(courseBundles);
  const usableBundlesPerCourse = courseCodes.map((code) =>
    courseBundles[code].filter((bundle) => bundle.sections.every((s) => s.seatsAvailable > 0)),
  );

  const valid = new Set<string>();
  function recurse(index: number, chosen: Bundle[], placed: Meeting[]) {
    if (index === courseCodes.length) {
      const key = chosen
        .flatMap((b) => b.sections.map((s) => s.crn))
        .sort()
        .join(",");
      valid.add(key);
      return;
    }
    for (const bundle of usableBundlesPerCourse[index]) {
      const bundleMeetings = bundle.sections.flatMap((s) => s.meetings);
      const conflicts =
        bundleMeetings.some((m) => placed.some((p) => referenceOverlap(m, p))) ||
        // internal self-conflict (only matters for multi-section bundles,
        // included for parity even though this test's bundles are single-section)
        bundleMeetings.some((m1, i) => bundleMeetings.some((m2, j) => i !== j && referenceOverlap(m1, m2)));
      if (conflicts) continue;
      recurse(index + 1, [...chosen, bundle], [...placed, ...bundleMeetings]);
    }
  }
  recurse(0, [], busyMeetings);
  return valid;
}

describe("generateSchedules — exhaustiveness (differential test against an independent brute-force reference)", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("finds exactly the same set of valid schedules as brute force (seed %i)", (seed) => {
    const rng = makeRng(seed * 7919);
    const numCourses = 3 + Math.floor(rng() * 2); // 3-4 courses
    const bundlesPerCourse = 3 + Math.floor(rng() * 3); // 3-5 bundles each
    const courseBundles = randomCourseBundles(numCourses, bundlesPerCourse, rng);

    // Occasionally include a busy block too, so the same exhaustiveness
    // guarantee is checked with the hard-constraint seeding path active,
    // not just the plain course-vs-course case.
    const busyBlocks: BusyBlock[] =
      seed % 2 === 0
        ? [{ label: "Work", days: [DAYS[Math.floor(rng() * DAYS.length)]], startTime: "09:00", endTime: "11:00", bufferMinutes: 0 }]
        : [];
    const busyMeetings = busyBlocks.length > 0
      ? busyBlocks.flatMap((b) => b.days.map((day) => ({ day, startTime: b.startTime, endTime: b.endTime, building: "", room: "" })))
      : [];

    const expected = bruteForceValidSchedules(courseBundles, busyMeetings);

    // maxResults set to the entire space so nothing gets truncated by the
    // top-K ranking — this test is about the SEARCH's completeness, not
    // the ranking that normally limits output to 3.
    const totalSpace = Math.pow(bundlesPerCourse, numCourses);
    const result = generateSchedules(courseBundles, { startTime: "00:00", endTime: "23:59" }, "none", busyBlocks, totalSpace + 1);

    const actual = new Set(
      result.schedules.map((s) =>
        [...s.selections.values()]
          .flatMap((b) => b.sections.map((sec) => sec.crn))
          .sort()
          .join(","),
      ),
    );

    expect(actual).toEqual(expected);
  });
});
