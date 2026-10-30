// The "fewest gaps" search skips branches that can't make the top few. This
// proves that shortcut never changes the answer: for many random scenarios it
// compares the real result against a plain brute force that scores every
// valid schedule with its own from-scratch gap math, then takes the top 3.
//
// Compared by (fits-window, gap) pairs, not by which sections were picked:
// two schedules can tie on gap, and which tied one is returned is arbitrary.
import { describe, expect, it } from "vitest";
import { generateSchedules } from "./scheduler.js";
import { Bundle, BusyBlock, DayOfWeek, Meeting } from "../types.js";

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
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

let crn = 0;
function randomBundle(courseCode: string, rng: () => number): Bundle {
  const meetingCount = rng() < 0.4 ? 2 : 1; // some bundles are lecture + discussion
  const meetings: Meeting[] = [];
  for (let i = 0; i < meetingCount; i++) {
    const start = (8 + Math.floor(rng() * 9)) * 60 + (rng() < 0.5 ? 0 : 30); // 8:00-16:30
    const length = rng() < 0.5 ? 50 : 80;
    meetings.push({ day: DAYS[Math.floor(rng() * 5)], startTime: fmt(start), endTime: fmt(start + length), building: "B", room: "1" });
  }
  crn += 1;
  return {
    courseCode,
    sections: [
      {
        crn: String(crn),
        courseCode,
        sectionType: "Lecture",
        linkId: null,
        meetings,
        seatsAvailable: rng() < 0.1 ? 0 : 10,
        maximumEnrollment: 30,
        creditHours: 4,
        instructor: "Prof X",
      },
    ],
  };
}

function overlap(a: Meeting, b: Meeting) {
  return a.day === b.day && toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);
}

// Gap = idle minutes between consecutive classes on the same day, summed.
function referenceGap(meetings: Meeting[]): number {
  let total = 0;
  for (const day of DAYS) {
    const sorted = meetings.filter((m) => m.day === day).sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    for (let i = 1; i < sorted.length; i++) total += Math.max(0, toMin(sorted[i].startTime) - toMin(sorted[i - 1].endTime));
  }
  return total;
}

function bruteForceTop(
  courseBundles: Record<string, Bundle[]>,
  busy: Meeting[],
  window: { startTime: string; endTime: string },
  limit: number,
): { fits: boolean; gap: number }[] {
  const lists = Object.values(courseBundles).map((bundles) => bundles.filter((b) => b.sections.every((s) => s.seatsAvailable > 0)));
  const scored: { fits: boolean; gap: number }[] = [];
  function recurse(i: number, placed: Meeting[], chosen: Meeting[]) {
    if (i === lists.length) {
      const fits = chosen.every((m) => toMin(m.startTime) >= toMin(window.startTime) && toMin(m.endTime) <= toMin(window.endTime));
      scored.push({ fits, gap: referenceGap(chosen) });
      return;
    }
    for (const bundle of lists[i]) {
      const meetings = bundle.sections.flatMap((s) => s.meetings);
      const clash =
        meetings.some((m) => placed.some((p) => overlap(m, p))) ||
        meetings.some((m1, a) => meetings.some((m2, b) => a !== b && overlap(m1, m2)));
      if (!clash) recurse(i + 1, [...placed, ...meetings], [...chosen, ...meetings]);
    }
  }
  recurse(0, busy, []);
  scored.sort((a, b) => (a.fits === b.fits ? a.gap - b.gap : a.fits ? -1 : 1));
  return scored.slice(0, limit);
}

describe("generateSchedules (fewest gaps) — pruned search matches brute force", () => {
  it.each(Array.from({ length: 40 }, (_, i) => i + 1))("same top 3 as brute force (seed %i)", (seed) => {
    const rng = makeRng(seed * 104729);
    const numCourses = 3 + Math.floor(rng() * 3); // 3-5 courses
    const perCourse = 3 + Math.floor(rng() * 4); // 3-6 bundles each
    const courseBundles: Record<string, Bundle[]> = {};
    for (let c = 0; c < numCourses; c++) {
      const code = `C${c}`;
      courseBundles[code] = Array.from({ length: perCourse }, () => randomBundle(code, rng));
    }
    // A narrower window than the full day, so "fits the window" actually varies.
    const window = rng() < 0.5 ? { startTime: "09:00", endTime: "15:00" } : { startTime: "08:00", endTime: "20:00" };
    const busyBlocks: BusyBlock[] =
      seed % 3 === 0
        ? [{ label: "Work", days: [DAYS[Math.floor(rng() * 5)]], startTime: "10:00", endTime: "12:00", bufferMinutes: 0 }]
        : [];
    const busyMeetings: Meeting[] = busyBlocks.flatMap((b) =>
      b.days.map((day) => ({ day, startTime: b.startTime, endTime: b.endTime, building: "", room: "" })),
    );

    const expected = bruteForceTop(courseBundles, busyMeetings, window, 3);
    const result = generateSchedules(courseBundles, window, "minimize", busyBlocks, 3);

    const actual = result.schedules.map((s) => ({ fits: s.fitsTimeRange, gap: s.gapMinutes }));
    expect(actual).toEqual(expected);
    expect(result.truncated).toBe(false);
  });

  it("returns best-so-far and flags it when the time budget runs out", () => {
    const rng = makeRng(99);
    const courseBundles: Record<string, Bundle[]> = {};
    for (let c = 0; c < 4; c++) courseBundles[`C${c}`] = Array.from({ length: 30 }, () => randomBundle(`C${c}`, rng));
    const result = generateSchedules(courseBundles, { startTime: "08:00", endTime: "20:00" }, "minimize", [], 3, -1);
    expect(result.truncated).toBe(true);
  });
});
