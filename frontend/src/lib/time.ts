import type { Bundle } from "../types";

// The calendar's fixed visible window (Step 6) — the slider is deliberately
// bounded to the same range so it can never ask for a time the grid can't draw.
export const DAY_START_MIN = 7 * 60; // 7:00 AM
export const DAY_END_MIN = 22 * 60; // 10:00 PM
export const SLIDER_STEP_MIN = 30;

// Pixels representing one hour of calendar height — taller rows for the
// "airy & spacious" density we're going for.
export const HOUR_PX = 64;

export const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function timeStringToMinutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

// "14:30" -> "2:30 PM" — for human-readable labels in the UI.
export function formatClock(time: string): string {
  const [hours, mins] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(mins).padStart(2, "0")} ${period}`;
}

// 135 -> "2h 15m" — for the gap-time stat.
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// The earliest class start time across a whole schedule. Sections with no
// meetings (arranged/async) are naturally skipped since they contribute no
// times to the list — if EVERY section turns out to be arranged, there's no
// minimum to take, so we return a clear label instead of crashing on
// Math.min() of an empty array (which silently gives back Infinity).
export function earliestStartLabel(selections: Record<string, Bundle>): string {
  const allStartTimes = Object.values(selections)
    .flatMap((bundle) => bundle.sections)
    .flatMap((section) => section.meetings)
    .map((meeting) => timeStringToMinutes(meeting.startTime));

  if (allStartTimes.length === 0) return "No fixed meetings";
  return formatClock(minutesToTimeString(Math.min(...allStartTimes)));
}
