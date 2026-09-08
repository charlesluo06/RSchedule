import { Bundle, BusyBlock, CandidateSchedule, Meeting } from "../types.js";

export interface TimeRangePreference {
  startTime: string; // "HH:MM", earliest acceptable class start
  endTime: string; // "HH:MM", latest acceptable class end
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Inverse of timeToMinutes, clamped to a single day (0-1440) — only ever
// used to build a synthetic busy-block Meeting for internal conflict
// checking, so it never needs to round-trip through a real class's actual
// clock time.
function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, totalMinutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function meetingsOverlap(a: Meeting, b: Meeting): boolean {
  if (a.day !== b.day) return false;
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
  // Two ranges overlap unless one ends before or exactly when the other starts.
  return aStart < bEnd && bStart < aEnd;
}

function bundleConflictsWithPlaced(bundle: Bundle, placedMeetings: Meeting[]): boolean {
  for (const section of bundle.sections) {
    for (const meeting of section.meetings) {
      if (placedMeetings.some((placed) => meetingsOverlap(meeting, placed))) {
        return true;
      }
    }
  }
  return false;
}

// Expands each authored block (one label, a day *set*, one time range) into
// N single-day Meeting-shaped records — the same precedent the app already
// uses for an MWF class (3 separate Meetings, never one multi-day Meeting).
// This is what lets busy blocks reuse meetingsOverlap/bundleConflictsWithPlaced
// unchanged, with zero new overlap math.
//
// Each Meeting is padded by bufferMinutes AFTER it ends only, not before it
// starts — nobody can walk from a shift straight into a lecture the instant
// one ends, so the block's real 2:00-6:00 PM becomes an effective
// 2:00-6:10 PM (at the default 10-minute buffer) purely for scheduling
// purposes. The start side is left alone deliberately: getting TO a busy
// block already has slack baked in from the class side, since UCR's own
// back-to-back class scheduling (e.g. a lecture ending :50 past the hour,
// the next slot starting on the hour) already leaves a gap before whatever
// comes next — there's no equivalent protection on the far side of a busy
// block, which is what actually needed padding. The calendar still renders
// the block's real, un-padded times (see BusyCalendarBlock) — this only
// ever affects what the scheduler is willing to place next to it.
export function busyBlocksToMeetings(blocks: BusyBlock[]): Meeting[] {
  return blocks.flatMap((block) =>
    block.days.map((day) => ({
      day,
      startTime: block.startTime,
      endTime: minutesToTime(timeToMinutes(block.endTime) + block.bufferMinutes),
      building: "",
      room: "",
    })),
  );
}

function allMeetings(selections: Map<string, Bundle>): Meeting[] {
  const meetings: Meeting[] = [];
  for (const bundle of selections.values()) {
    for (const section of bundle.sections) {
      meetings.push(...section.meetings);
    }
  }
  return meetings;
}

function computeFitsTimeRange(meetings: Meeting[], pref: TimeRangePreference): boolean {
  const prefStart = timeToMinutes(pref.startTime);
  const prefEnd = timeToMinutes(pref.endTime);
  return meetings.every((m) => timeToMinutes(m.startTime) >= prefStart && timeToMinutes(m.endTime) <= prefEnd);
}

function computeGapMinutes(meetings: Meeting[]): number {
  const byDay = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const group = byDay.get(m.day) ?? [];
    group.push(m);
    byDay.set(m.day, group);
  }

  let totalGap = 0;
  for (const dayMeetings of byDay.values()) {
    const sorted = [...dayMeetings].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = timeToMinutes(sorted[i - 1].endTime);
      const currStart = timeToMinutes(sorted[i].startTime);
      totalGap += Math.max(0, currStart - prevEnd);
    }
  }
  return totalGap;
}

/**
 * Runs the exact backtracking search: tries every bundle for each course in
 * turn, pruning only branches that create an actual time conflict. Calls
 * `onValid` for every complete, non-conflicting schedule it finds, passing
 * the live (not cloned) `selections` map — callers that need to keep it past
 * the call must clone it themselves, since it's mutated again immediately
 * after `onValid` returns as the recursion unwinds.
 *
 * Courses picked from unrelated departments (e.g. gen-ed electives) rarely
 * conflict with each other at all, so for those the search can find that a
 * large fraction of the full combinatorial space is actually valid — up to
 * hundreds of thousands of complete schedules for a handful of large
 * courses. Streaming each one through `onValid` instead of collecting them
 * into an array is what makes that case tractable (see `generateSchedules`,
 * which only clones and keeps the running top few instead of all of them).
 */
function search(
  courseOrder: { courseCode: string; bundles: Bundle[] }[],
  index: number,
  selections: Map<string, Bundle>,
  placedMeetings: Meeting[],
  onValid: (selections: Map<string, Bundle>) => void,
): void {
  if (index === courseOrder.length) {
    onValid(selections);
    return;
  }

  const { courseCode, bundles } = courseOrder[index];
  for (const bundle of bundles) {
    if (bundleConflictsWithPlaced(bundle, placedMeetings)) continue;

    selections.set(courseCode, bundle);
    const newMeetings = bundle.sections.flatMap((s) => s.meetings);
    search(courseOrder, index + 1, selections, [...placedMeetings, ...newMeetings], onValid);
    selections.delete(courseCode);
  }
}

// Matches the ordering `generateSchedules` used to sort the full results
// array by before slicing to the top few — kept as its own function so the
// streaming version below can use identical tie-breaking when deciding
// whether to keep a candidate, instead of sorting everything after the fact.
function compareCandidates(a: CandidateSchedule, b: CandidateSchedule, gapSign: number): number {
  if (a.fitsTimeRange !== b.fitsTimeRange) return a.fitsTimeRange ? -1 : 1;
  return gapSign * (a.gapMinutes - b.gapMinutes);
}

// Keeps `sorted` holding only the best `maxResults` candidates seen so far
// (per `compareCandidates`), inserting in sorted order and evicting the
// worst one once it's full — equivalent to sorting everything and slicing,
// but never materializes more than `maxResults` candidates at a time.
function insertTopResult(
  sorted: CandidateSchedule[],
  candidate: CandidateSchedule,
  maxResults: number,
  gapSign: number,
): void {
  let insertAt = sorted.length;
  for (let i = 0; i < sorted.length; i++) {
    if (compareCandidates(candidate, sorted[i], gapSign) < 0) {
      insertAt = i;
      break;
    }
  }
  if (insertAt >= maxResults) return; // wouldn't make the cut even with room
  sorted.splice(insertAt, 0, candidate);
  if (sorted.length > maxResults) sorted.pop();
}

function scheduleKey(selections: Map<string, Bundle>): string {
  return [...selections.values()]
    .flatMap((b) => b.sections.map((s) => s.crn))
    .sort()
    .join(",");
}

export type UnschedulableReason = "not-offered" | "all-full" | "busy-conflict";

export interface GenerateResult {
  schedules: CandidateSchedule[];
  anyValidSchedule: boolean;
  anyFitsTimeRange: boolean;
  // Courses that were impossible to schedule for a reason we can pin down
  // before even running the search — as opposed to a genuine time conflict,
  // which only shows up after trying every combination.
  unschedulableCourses: { courseCode: string; reason: UnschedulableReason }[];
}

// "minimize" prefers tightly-packed schedules, "maximize" prefers spread-out
// ones, and "none" means the user doesn't care about gaps at all — so we skip
// gap comparison entirely and rank purely by whether the schedule fits the
// preferred time window.
export type GapPreference = "minimize" | "maximize" | "none";

// A bundle is only actually registerable if every section in it (lecture,
// discussion, lab) still has an open seat — one full component makes the
// whole combination unusable, even if the other components are open.
function hasOpenSeats(bundle: Bundle): boolean {
  return bundle.sections.every((section) => section.seatsAvailable > 0);
}

// UCR's own linked-sections data occasionally lists a lecture/discussion/lab
// combination as officially registerable even though two of its own pieces
// overlap in time (confirmed against Banner's getLinkedSections directly —
// this isn't a bug in our linking logic, it's real UCR data). Our app's
// core promise is "no overlapping classes," so a bundle that conflicts with
// itself is never usable, regardless of what UCR's registration portal
// would technically let a student attempt to register for.
function hasNoInternalConflict(bundle: Bundle): boolean {
  const meetings = bundle.sections.flatMap((section) => section.meetings);
  for (let i = 0; i < meetings.length; i++) {
    for (let j = i + 1; j < meetings.length; j++) {
      if (meetingsOverlap(meetings[i], meetings[j])) return false;
    }
  }
  return true;
}

export function generateSchedules(
  courseBundles: Record<string, Bundle[]>,
  preference: TimeRangePreference,
  gapPreference: GapPreference = "minimize",
  busyBlocks: BusyBlock[] = [],
  maxResults = 3,
): GenerateResult {
  const busyMeetings = busyBlocksToMeetings(busyBlocks);

  // Combines the old two-pass "figure out why a course is unschedulable"
  // loop and "build the filtered course order" loop into one, now that
  // there's a third reason (busy-conflict) to distinguish alongside the
  // existing not-offered/all-full ones.
  const unschedulableCourses: { courseCode: string; reason: UnschedulableReason }[] = [];
  const courseOrder = Object.entries(courseBundles)
    .map(([courseCode, bundles]) => {
      const openBundles = bundles.filter(hasOpenSeats);
      const validBundles = openBundles.filter(
        (b) => hasNoInternalConflict(b) && !bundleConflictsWithPlaced(b, busyMeetings),
      );
      if (bundles.length === 0) {
        unschedulableCourses.push({ courseCode, reason: "not-offered" });
      } else if (openBundles.length === 0) {
        unschedulableCourses.push({ courseCode, reason: "all-full" });
      } else if (validBundles.length === 0) {
        unschedulableCourses.push({ courseCode, reason: "busy-conflict" });
      }
      return { courseCode, bundles: validBundles };
    })
    // Most-constrained-first: courses with fewer options get tried first,
    // so branches that will fail get pruned as early as possible.
    .sort((a, b) => a.bundles.length - b.bundles.length);

  // gapSign of 0 (for "none") makes the gap term drop out, so schedules are
  // ordered only by whether they fit the time window.
  const gapSign = gapPreference === "minimize" ? 1 : gapPreference === "maximize" ? -1 : 0;

  // Courses from unrelated departments (e.g. gen-ed electives) can turn out
  // to have almost no real time conflicts at all, in which case the search
  // below finds that a large fraction of the full combinatorial space is
  // valid — this has measured in the hundreds of thousands of complete
  // schedules for just 4 large courses. The old approach collected every one
  // of those into an array, mapped and sorted the whole thing, then took the
  // top 3 — which is what actually made that case take ~20 seconds (the
  // traversal itself was never the bottleneck). Only ever keeping the
  // running best `maxResults` candidates here, and only cloning a selection
  // when it's actually good enough to keep, avoids doing that work at all.
  let anyValidSchedule = false;
  let anyFitsTimeRange = false;
  const seenKeys = new Set<string>();
  const selected: CandidateSchedule[] = [];

  // Seeding placedMeetings with busyMeetings (instead of []) is the entire
  // hard-constraint mechanism for busy blocks — search() and
  // bundleConflictsWithPlaced() already treat "things already occupying
  // time" as a flat Meeting[] with no other special-casing needed. Because
  // this array is fixed for the whole tree, computeGapMinutes/allMeetings
  // (which derive purely from `selections`, not from placedMeetings) never
  // see busy blocks — gap math stays class-only, which is deliberate: fixing
  // that a hole next to a work shift "shouldn't count" as free time is a
  // separate ranking-semantics decision, not part of this constraint.
  search(courseOrder, 0, new Map(), busyMeetings, (liveSelections) => {
    anyValidSchedule = true;
    const meetings = allMeetings(liveSelections);
    const fitsTimeRange = computeFitsTimeRange(meetings, preference);
    if (fitsTimeRange) anyFitsTimeRange = true;

    const key = scheduleKey(liveSelections);
    if (seenKeys.has(key)) return; // identical schedule, not a meaningfully distinct option
    seenKeys.add(key);

    const candidate: CandidateSchedule = {
      selections: new Map(liveSelections), // clone — liveSelections mutates as recursion unwinds
      gapMinutes: computeGapMinutes(meetings),
      fitsTimeRange,
    };
    insertTopResult(selected, candidate, maxResults, gapSign);
  });

  return {
    schedules: selected,
    anyValidSchedule,
    anyFitsTimeRange,
    unschedulableCourses,
  };
}
