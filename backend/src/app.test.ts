// Covers validateBusyBlocks in isolation — busy blocks are the one
// genuinely free-form user-authored input /generate accepts (see the
// function's own doc comment in app.ts for why it gets real validation
// where the rest of the route deliberately doesn't).
import { describe, expect, it } from "vitest";
import { validateBusyBlocks } from "./app.js";

describe("validateBusyBlocks", () => {
  it("treats an omitted busyBlocks as an empty array (backwards compatible)", () => {
    expect(validateBusyBlocks(undefined)).toEqual({ ok: true, value: [] });
  });

  it("accepts a well-formed block and fills in defaults", () => {
    const result = validateBusyBlocks([
      { label: "Work", days: ["Mon", "Wed"], startTime: "14:00", endTime: "18:00" },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ label: "Work", days: ["Mon", "Wed"], startTime: "14:00", endTime: "18:00", bufferMinutes: 10 }],
    });
  });

  it("de-duplicates repeated days within one block", () => {
    const result = validateBusyBlocks([
      { label: "Work", days: ["Mon", "Mon", "Wed"], startTime: "14:00", endTime: "18:00" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0].days).toEqual(["Mon", "Wed"]);
  });

  it("accepts an explicit bufferMinutes within range", () => {
    const result = validateBusyBlocks([
      { label: "Work", days: ["Mon"], startTime: "14:00", endTime: "18:00", bufferMinutes: 45 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0].bufferMinutes).toBe(45);
  });

  it.each([
    ["non-array input", "nope"],
    ["non-array input (object)", { days: ["Mon"] }],
  ])("rejects %s", (_label, input) => {
    expect(validateBusyBlocks(input).ok).toBe(false);
  });

  it("rejects more than the maximum allowed number of blocks", () => {
    const many = Array.from({ length: 21 }, () => ({
      label: "x",
      days: ["Mon"],
      startTime: "10:00",
      endTime: "11:00",
    }));
    expect(validateBusyBlocks(many).ok).toBe(false);
  });

  it("rejects an empty days array", () => {
    expect(validateBusyBlocks([{ label: "x", days: [], startTime: "10:00", endTime: "11:00" }]).ok).toBe(false);
  });

  it("rejects an invalid day", () => {
    expect(validateBusyBlocks([{ label: "x", days: ["Sat"], startTime: "10:00", endTime: "11:00" }]).ok).toBe(false);
  });

  it.each([
    ["unpadded hour", "9:00"],
    ["out of range hour", "25:00"],
    ["not a time at all", "noon"],
  ])("rejects a malformed startTime (%s)", (_label, startTime) => {
    expect(validateBusyBlocks([{ label: "x", days: ["Mon"], startTime, endTime: "11:00" }]).ok).toBe(false);
  });

  it("rejects endTime at or before startTime", () => {
    expect(
      validateBusyBlocks([{ label: "x", days: ["Mon"], startTime: "11:00", endTime: "11:00" }]).ok,
    ).toBe(false);
    expect(
      validateBusyBlocks([{ label: "x", days: ["Mon"], startTime: "11:00", endTime: "10:00" }]).ok,
    ).toBe(false);
  });

  it.each([
    ["negative", -5],
    ["too large", 121],
    ["non-integer", 10.5],
    ["wrong type", "10"],
  ])("rejects an out-of-range or malformed bufferMinutes (%s)", (_label, bufferMinutes) => {
    expect(
      validateBusyBlocks([{ label: "x", days: ["Mon"], startTime: "10:00", endTime: "11:00", bufferMinutes }]).ok,
    ).toBe(false);
  });

  it("coerces a missing/non-string label to an empty string rather than rejecting", () => {
    const result = validateBusyBlocks([{ days: ["Mon"], startTime: "10:00", endTime: "11:00" }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0].label).toBe("");
  });
});
