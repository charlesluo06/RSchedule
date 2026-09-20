// These formalize the same scenarios that were verified manually via
// throwaway scripts while building busy-time blocking + the buffer feature
// (see conversation history) — turning one-time verification into a
// permanent regression test instead of re-deriving it from scratch next time.
import { describe, expect, it } from "vitest";
import { applyArcConsistency, generateSchedules } from "./scheduler.js";
import { Bundle, DayOfWeek } from "../types.js";

// Builds a single-section bundle for an arbitrary course/CRN pair — unlike
// the `section()` helper below (which ties courseCode to the CRN 1:1), this
// lets a test put multiple distinct bundles under the SAME course, which
// arc-consistency tests need.
function bundleFor(courseCode: string, crn: string, day: DayOfWeek, start: string, end: string): Bundle {
  return {
    courseCode,
    sections: [
      {
        crn,
        courseCode,
        sectionType: "Lecture",
        linkId: null,
        meetings: [{ day, startTime: start, endTime: end, building: "B", room: "1" }],
        seatsAvailable: 10,
        maximumEnrollment: 30,
        creditHours: 4,
        instructor: "Prof X",
      },
    ],
  };
}

function section(crn: string, day: DayOfWeek, start: string, end: string): Bundle {
  return {
    courseCode: `COURSE${crn}`,
    sections: [
      {
        crn,
        courseCode: `COURSE${crn}`,
        sectionType: "Lecture",
        linkId: null,
        meetings: [{ day, startTime: start, endTime: end, building: "B", room: "1" }],
        seatsAvailable: 10,
        maximumEnrollment: 30,
        creditHours: 4,
        instructor: "Prof X",
      },
    ],
  };
}

function crnsOf(schedule: { selections: Map<string, Bundle> }): string[] {
  return [...schedule.selections.values()].flatMap((b) => b.sections.map((s) => s.crn));
}

describe("generateSchedules — busy blocks as a hard constraint", () => {
  const courseBundles: Record<string, Bundle[]> = {
    MATH009A: [section("100", "Mon", "09:00", "09:50"), section("101", "Mon", "11:00", "11:50")],
    CS111: [section("200", "Tue", "10:00", "10:50")],
  };

  it("is unaffected by a busy block with no default buffer that doesn't overlap anything", () => {
    const baseline = generateSchedules(courseBundles, { startTime: "07:00", endTime: "22:00" }, "minimize", []);
    const withBlock = generateSchedules(courseBundles, { startTime: "07:00", endTime: "22:00" }, "minimize", [
      { label: "Late", days: ["Fri"], startTime: "19:00", endTime: "21:00", bufferMinutes: 0 },
    ]);
    expect(withBlock.schedules.map(crnsOf)).toEqual(baseline.schedules.map(crnsOf));
    expect(withBlock.schedules.map((s) => s.gapMinutes)).toEqual(baseline.schedules.map((s) => s.gapMinutes));
  });

  it("excludes a specific section that overlaps a busy block, keeping the other valid option", () => {
    const result = generateSchedules(courseBundles, { startTime: "07:00", endTime: "22:00" }, "minimize", [
      { label: "Work", days: ["Mon"], startTime: "09:00", endTime: "10:00", bufferMinutes: 0 },
    ]);
    for (const schedule of result.schedules) {
      expect(crnsOf(schedule)).not.toContain("100");
      expect(crnsOf(schedule)).toContain("101");
    }
  });

  it("allows a class ending exactly when a busy block starts (touching, not overlapping)", () => {
    const result = generateSchedules(courseBundles, { startTime: "07:00", endTime: "22:00" }, "minimize", [
      { label: "Work", days: ["Mon"], startTime: "09:50", endTime: "11:00", bufferMinutes: 0 },
    ]);
    expect(result.schedules.some((s) => crnsOf(s).includes("100"))).toBe(true);
  });

  it("blocks a class that overlaps a busy block by even one minute", () => {
    const result = generateSchedules(courseBundles, { startTime: "07:00", endTime: "22:00" }, "minimize", [
      { label: "Work", days: ["Mon"], startTime: "09:49", endTime: "11:00", bufferMinutes: 0 },
    ]);
    expect(result.schedules.every((s) => !crnsOf(s).includes("100"))).toBe(true);
  });

  it("reports busy-conflict when a busy block removes every option for a course", () => {
    const result = generateSchedules(courseBundles, { startTime: "07:00", endTime: "22:00" }, "minimize", [
      { label: "Practice", days: ["Tue"], startTime: "09:00", endTime: "12:00", bufferMinutes: 0 },
    ]);
    expect(result.anyValidSchedule).toBe(false);
    expect(result.unschedulableCourses).toContainEqual({ courseCode: "CS111", reason: "busy-conflict" });
  });

  it("reports no valid schedule when a busy block covers the entire week", () => {
    const result = generateSchedules(courseBundles, { startTime: "07:00", endTime: "22:00" }, "minimize", [
      { label: "AllDay", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "07:00", endTime: "22:00", bufferMinutes: 0 },
    ]);
    expect(result.anyValidSchedule).toBe(false);
  });

  it("omitting busyBlocks entirely behaves the same as passing an empty array", () => {
    const withEmpty = generateSchedules(courseBundles, { startTime: "07:00", endTime: "22:00" }, "minimize", []);
    const withDefault = generateSchedules(courseBundles, { startTime: "07:00", endTime: "22:00" });
    expect(withDefault.schedules.map(crnsOf)).toEqual(withEmpty.schedules.map(crnsOf));
  });
});

describe("generateSchedules — buffer is applied after a busy block ends only, never before it starts", () => {
  it("allows a class ending exactly when the block starts, regardless of buffer size", () => {
    const classBeforeWork: Record<string, Bundle[]> = { MATH009A: [section("100", "Mon", "09:00", "10:00")] };
    for (const bufferMinutes of [0, 10, 30]) {
      const result = generateSchedules(classBeforeWork, { startTime: "07:00", endTime: "22:00" }, "minimize", [
        { label: "Work", days: ["Mon"], startTime: "10:00", endTime: "14:00", bufferMinutes },
      ]);
      expect(result.anyValidSchedule).toBe(true);
    }
  });

  it("blocks a class starting exactly when the block ends, once a buffer is set", () => {
    const classAfterWork: Record<string, Bundle[]> = { MATH009A: [section("100", "Mon", "14:00", "14:50")] };

    const noBuffer = generateSchedules(classAfterWork, { startTime: "07:00", endTime: "22:00" }, "minimize", [
      { label: "Work", days: ["Mon"], startTime: "10:00", endTime: "14:00", bufferMinutes: 0 },
    ]);
    expect(noBuffer.anyValidSchedule).toBe(true);

    const withBuffer = generateSchedules(classAfterWork, { startTime: "07:00", endTime: "22:00" }, "minimize", [
      { label: "Work", days: ["Mon"], startTime: "10:00", endTime: "14:00", bufferMinutes: 10 },
    ]);
    expect(withBuffer.anyValidSchedule).toBe(false);
    expect(withBuffer.unschedulableCourses).toContainEqual({ courseCode: "MATH009A", reason: "busy-conflict" });
  });

  it("allows a class 30 minutes after the block ends even with a 30-minute buffer (touching boundary)", () => {
    const classCourses: Record<string, Bundle[]> = { MATH009A: [section("100", "Mon", "12:30", "13:20")] };
    const result = generateSchedules(classCourses, { startTime: "07:00", endTime: "22:00" }, "minimize", [
      { label: "Work", days: ["Mon"], startTime: "08:00", endTime: "12:00", bufferMinutes: 30 },
    ]);
    expect(result.anyValidSchedule).toBe(true);
  });
});

describe("applyArcConsistency", () => {
  it("removes a bundle that conflicts with every bundle of another course", () => {
    // CS100's only section conflicts with both of MATH009A's sections — it
    // can never be part of any valid schedule, so it should be removed
    // even though nothing has actually tried to combine them yet.
    const courseOrder = [
      {
        courseCode: "MATH009A",
        bundles: [
          bundleFor("MATH009A", "1", "Mon", "09:00", "09:50"),
          bundleFor("MATH009A", "2", "Mon", "11:00", "11:50"),
        ],
      },
      { courseCode: "CS100", bundles: [bundleFor("CS100", "3", "Mon", "09:00", "11:50")] },
    ];

    const result = applyArcConsistency(courseOrder);
    const cs100 = result.find((c) => c.courseCode === "CS100")!;
    expect(cs100.bundles).toEqual([]);
  });

  it("keeps a bundle that's compatible with at least one option of every other course", () => {
    const courseOrder = [
      {
        courseCode: "MATH009A",
        bundles: [
          bundleFor("MATH009A", "1", "Mon", "09:00", "09:50"),
          bundleFor("MATH009A", "2", "Mon", "11:00", "11:50"),
        ],
      },
      // Conflicts with MATH009A's first section but not its second — has a
      // real chance of being used, so it must survive.
      { courseCode: "CS100", bundles: [bundleFor("CS100", "3", "Mon", "09:00", "09:50")] },
    ];

    const result = applyArcConsistency(courseOrder);
    const cs100 = result.find((c) => c.courseCode === "CS100")!;
    expect(cs100.bundles).toHaveLength(1);
  });

  it("leaves completely independent courses untouched", () => {
    const courseOrder = [
      { courseCode: "A", bundles: [bundleFor("A", "1", "Mon", "09:00", "09:50")] },
      { courseCode: "B", bundles: [bundleFor("B", "2", "Tue", "09:00", "09:50")] },
    ];

    const result = applyArcConsistency(courseOrder);
    expect(result.find((c) => c.courseCode === "A")!.bundles).toHaveLength(1);
    expect(result.find((c) => c.courseCode === "B")!.bundles).toHaveLength(1);
  });

  it("cascades removals to a fixed point across three courses", () => {
    // The cascade: b1 conflicts with C's only bundle (c1), so b1 gets
    // removed once B is checked against C. But a1's ONLY compatible option
    // in B was b1 — once b1 is gone, a1 has no remaining support either,
    // even though a1 vs b2 was never directly incompatible-with-everything
    // on the very first look at A-vs-B (b1 was still there then). A single
    // non-iterated pass — checking A against B before B ever loses b1 —
    // would leave a1 in place by mistake; only re-sweeping to a fixed point
    // catches this.
    const courseOrder = [
      {
        courseCode: "A",
        bundles: [
          bundleFor("A", "a1", "Mon", "09:00", "09:50"), // only compatible with B1
          bundleFor("A", "a2", "Wed", "09:00", "09:50"), // compatible with everything
        ],
      },
      {
        courseCode: "B",
        bundles: [
          bundleFor("B", "b1", "Tue", "09:00", "09:50"), // conflicts with every C bundle -> removed
          bundleFor("B", "b2", "Mon", "09:00", "09:50"), // conflicts with A's a1 -> only survives via a2
        ],
      },
      { courseCode: "C", bundles: [bundleFor("C", "c1", "Tue", "09:00", "09:50")] },
    ];

    const result = applyArcConsistency(courseOrder);
    const a = result.find((c) => c.courseCode === "A")!;
    const b = result.find((c) => c.courseCode === "B")!;
    const c = result.find((c) => c.courseCode === "C")!;

    // b1 is gone (conflicts with C's only bundle).
    expect(b.bundles.map((bundle) => bundle.sections[0].crn)).toEqual(["b2"]);
    // a1's only support (b1) is gone, so a1 must be gone too — this is
    // specifically the cascading case a single non-iterated pass would miss.
    expect(a.bundles.map((bundle) => bundle.sections[0].crn)).toEqual(["a2"]);
    // c1 has no conflicts with what's left of A or B, so it survives.
    expect(c.bundles).toHaveLength(1);
  });

  it("never removes anything when nothing is actually incompatible", () => {
    const courseOrder = [
      { courseCode: "A", bundles: [bundleFor("A", "1", "Mon", "09:00", "09:50")] },
      { courseCode: "B", bundles: [bundleFor("B", "2", "Mon", "10:00", "10:50")] },
      { courseCode: "C", bundles: [bundleFor("C", "3", "Mon", "11:00", "11:50")] },
    ];

    const result = applyArcConsistency(courseOrder);
    expect(result.every((c) => c.bundles.length === 1)).toBe(true);
  });

  // Regression test for a real bug: a course that's already unschedulable
  // for an unrelated reason (all-full, not-offered, busy-conflict) arrives
  // here with an EMPTY bundle list. Without a guard, "does this bundle have
  // a compatible partner in the other course" is vacuously false when the
  // other course's list is empty — wrongly wiping out every other selected
  // course's options too, even ones that never actually conflict with each
  // other. Caught live: ECON005 (all-full) + CS166 + CS153, where CS166 and
  // CS153 schedule together fine on their own, but were both incorrectly
  // flagged as conflicting with "your other selected courses" the moment
  // ECON005 (unrelated, already-full) was in the mix.
  it("doesn't let an already-empty (e.g. all-full) course's domain wipe out unrelated courses", () => {
    const courseOrder = [
      { courseCode: "ECON005", bundles: [] }, // already emptied by the all-full filter upstream
      { courseCode: "CS166", bundles: [bundleFor("CS166", "1", "Mon", "09:00", "09:50")] },
      { courseCode: "CS153", bundles: [bundleFor("CS153", "2", "Tue", "10:00", "10:50")] },
    ];

    const result = applyArcConsistency(courseOrder);
    expect(result.find((c) => c.courseCode === "CS166")!.bundles).toHaveLength(1);
    expect(result.find((c) => c.courseCode === "CS153")!.bundles).toHaveLength(1);
  });
});

describe("generateSchedules — an all-full course doesn't falsely flag unrelated courses", () => {
  it("only reports the actually-full course, not the two that schedule together fine", () => {
    const full = bundleFor("ECON005", "1", "Mon", "09:00", "09:50");
    full.sections[0].seatsAvailable = 0; // genuinely all-full, not just a normal section

    const courseBundles: Record<string, Bundle[]> = {
      ECON005: [full],
      CS166: [bundleFor("CS166", "2", "Mon", "09:00", "09:50")],
      CS153: [bundleFor("CS153", "3", "Tue", "10:00", "10:50")],
    };

    const result = generateSchedules(courseBundles, { startTime: "07:00", endTime: "22:00" });

    expect(result.unschedulableCourses).toEqual([{ courseCode: "ECON005", reason: "all-full" }]);
    expect(result.unschedulableCourses.find((u) => u.courseCode === "CS166")).toBeUndefined();
    expect(result.unschedulableCourses.find((u) => u.courseCode === "CS153")).toBeUndefined();
  });
});
