// These formalize the same scenarios that were verified manually via
// throwaway scripts while building busy-time blocking + the buffer feature
// (see conversation history) — turning one-time verification into a
// permanent regression test instead of re-deriving it from scratch next time.
import { describe, expect, it } from "vitest";
import { generateSchedules } from "./scheduler.js";
import { Bundle, DayOfWeek } from "../types.js";

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
