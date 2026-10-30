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

const DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };

// A bundle with its numbers worked out once up front, so the search below
// never has to re-derive them for every one of millions of combinations.
interface PreparedBundle {
  bundle: Bundle;
  meetings: Meeting[];
  // Earliest start / latest end per weekday (Mon..Fri), in minutes; the
  // sentinels mean "no class that day".
  minStart: number[];
  maxEnd: number[];
  durationByDay: number[]; // class minutes per weekday (Mon..Fri)
  slots: { day: number; start: number; end: number }[]; // meetings as plain numbers
  outsideWindow: boolean; // some meeting falls outside the preferred time window
}

function prepareBundle(bundle: Bundle, pref: TimeRangePreference): PreparedBundle {
  const prefStart = timeToMinutes(pref.startTime);
  const prefEnd = timeToMinutes(pref.endTime);
  const meetings = bundle.sections.flatMap((section) => section.meetings);
  const minStart = [Infinity, Infinity, Infinity, Infinity, Infinity];
  const maxEnd = [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity];
  const durationByDay = [0, 0, 0, 0, 0];
  const slots: { day: number; start: number; end: number }[] = [];
  let outsideWindow = false;
  for (const meeting of meetings) {
    const day = DAY_INDEX[meeting.day];
    const start = timeToMinutes(meeting.startTime);
    const end = timeToMinutes(meeting.endTime);
    minStart[day] = Math.min(minStart[day], start);
    maxEnd[day] = Math.max(maxEnd[day], end);
    durationByDay[day] += end - start;
    slots.push({ day, start, end });
    if (start < prefStart || end > prefEnd) outsideWindow = true;
  }
  return { bundle, meetings, minStart, maxEnd, durationByDay, slots, outsideWindow };
}

/**
 * Finds the best `maxResults` schedules for the "fewest gaps" ranking without
 * walking every combination.
 *
 * In a conflict-free schedule, a day's gap time is exactly (last class end -
 * first class start) minus the minutes actually in class, so the total gap is
 * (sum of each day's span) - (total class minutes). Adding classes can only
 * widen a day's span, and the most they can shrink a day's gap by is their
 * own class minutes on that day. That gives a safe lower bound for any
 * half-built schedule: each day's gap so far, minus the most the remaining
 * courses could still fill in that day (never below zero). A branch whose
 * best possible outcome can't beat the current
 * top few is skipped, which keeps the answer identical to checking
 * everything. Bundles are tried best-first so good schedules turn up early
 * and the bound starts cutting quickly.
 *
 * Also stops at `deadline` (a performance.now() time) and reports that it did,
 * so a huge course set returns its best-so-far instead of timing out.
 */
function searchBestByGap(
  courseOrder: { courseCode: string; bundles: Bundle[] }[],
  pref: TimeRangePreference,
  busyMeetings: Meeting[],
  maxResults: number,
  deadline: number,
): { selected: CandidateSchedule[]; truncated: boolean } {
  const order = courseOrder.map((course) => ({
    courseCode: course.courseCode,
    prepared: course.bundles.map((bundle) => prepareBundle(bundle, pref)),
  }));
  const count = order.length;

  // fillByDay[k][d] = the most gap the courses from k onward could possibly
  // fill on weekday d (each course contributes its busiest option that day).
  const fillByDay: number[][] = [];
  for (let k = 0; k <= count; k++) fillByDay.push([0, 0, 0, 0, 0]);
  for (let k = count - 1; k >= 0; k--) {
    for (let d = 0; d < 5; d++) {
      fillByDay[k][d] = fillByDay[k + 1][d] + Math.max(0, ...order[k].prepared.map((p) => p.durationByDay[d]));
    }
  }

  // Total gap, and the least it could still end up as, for a partial schedule.
  function gapOf(minS: number[], maxE: number[], durDay: number[], fill: number[] | null): number {
    let total = 0;
    for (let d = 0; d < 5; d++) {
      if (maxE[d] <= minS[d]) continue;
      const dayGap = maxE[d] - minS[d] - durDay[d];
      total += fill ? Math.max(0, dayGap - fill[d]) : dayGap;
    }
    return total;
  }

  // A tighter bound, used only when the cheap one above didn't prune. Class
  // time outside a day's current span can never shrink that day's gap (it just
  // stretches the day), so only meetings that fall INSIDE the current span can
  // fill gap. For each remaining course, count the most such minutes any one
  // of its options could contribute on each day.
  function insideFillBound(from: number, minS: number[], maxE: number[], durDay: number[]): number {
    const fill = [0, 0, 0, 0, 0];
    for (let c = from; c < count; c++) {
      const best = [0, 0, 0, 0, 0];
      for (const p of order[c].prepared) {
        const inside = [0, 0, 0, 0, 0];
        for (const slot of p.slots) {
          if (slot.start >= minS[slot.day] && slot.end <= maxE[slot.day]) inside[slot.day] += slot.end - slot.start;
        }
        for (let d = 0; d < 5; d++) if (inside[d] > best[d]) best[d] = inside[d];
      }
      for (let d = 0; d < 5; d++) fill[d] += best[d];
    }
    return gapOf(minS, maxE, durDay, fill);
  }

  const selected: CandidateSchedule[] = [];
  const chosen: PreparedBundle[] = new Array(count);
  let nodes = 0;
  let truncated = false;

  // Can a schedule that ends up with (fits, at-best gap) still make the cut?
  function cannotBeatWorst(fits: boolean, bestGap: number): boolean {
    if (selected.length < maxResults) return false;
    const worst = selected[selected.length - 1];
    if (worst.fitsTimeRange !== fits) return worst.fitsTimeRange && !fits;
    return bestGap >= worst.gapMinutes;
  }

  function recurse(k: number, placed: Meeting[], fits: boolean, minS: number[], maxE: number[], durDay: number[]): void {
    if (truncated) return;
    nodes += 1;
    // Checking the clock is cheap but not free, so only look every 256 steps (and on the first).
    if ((nodes & 255) === 1 && performance.now() > deadline) {
      truncated = true;
      return;
    }

    if (k === count) {
      const gap = gapOf(minS, maxE, durDay, null);
      if (cannotBeatWorst(fits, gap)) return;
      const selections = new Map<string, Bundle>();
      order.forEach((course, i) => selections.set(course.courseCode, chosen[i].bundle));
      insertTopResult(selected, { selections, gapMinutes: gap, fitsTimeRange: fits }, maxResults, 1);
      return;
    }

    const children: { p: PreparedBundle; minS: number[]; maxE: number[]; durDay: number[]; fits: boolean; gap: number; bound: number }[] = [];
    for (const p of order[k].prepared) {
      if (p.meetings.some((meeting) => placed.some((other) => meetingsOverlap(meeting, other)))) continue;
      const nextMin = minS.slice();
      const nextMax = maxE.slice();
      const nextDur = durDay.slice();
      for (let d = 0; d < 5; d++) {
        if (p.minStart[d] < nextMin[d]) nextMin[d] = p.minStart[d];
        if (p.maxEnd[d] > nextMax[d]) nextMax[d] = p.maxEnd[d];
        nextDur[d] += p.durationByDay[d];
      }
      children.push({
        p,
        minS: nextMin,
        maxE: nextMax,
        durDay: nextDur,
        fits: fits && !p.outsideWindow,
        gap: gapOf(nextMin, nextMax, nextDur, null),
        bound: gapOf(nextMin, nextMax, nextDur, fillByDay[k + 1]),
      });
    }
    children.sort((a, b) => (a.fits === b.fits ? a.gap - b.gap : a.fits ? -1 : 1));

    for (const child of children) {
      if (cannotBeatWorst(child.fits, child.bound)) continue;
      if (k + 1 < count && cannotBeatWorst(child.fits, insideFillBound(k + 1, child.minS, child.maxE, child.durDay))) continue;
      chosen[k] = child.p;
      recurse(k + 1, [...placed, ...child.p.meetings], child.fits, child.minS, child.maxE, child.durDay);
    }
  }

  const empty = [Infinity, Infinity, Infinity, Infinity, Infinity];
  const none = [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity];
  recurse(0, busyMeetings, true, empty, none, [0, 0, 0, 0, 0]);
  return { selected, truncated };
}

// How long a single search may run before returning its best-so-far. Kept well
// under the function's 25s limit to leave room for request handling.
const DEFAULT_TIME_BUDGET_MS = 12_000;

export type UnschedulableReason = "not-offered" | "all-full" | "busy-conflict" | "course-conflict";

export interface GenerateResult {
  schedules: CandidateSchedule[];
  anyValidSchedule: boolean;
  anyFitsTimeRange: boolean;
  // True when the search hit its time budget and stopped early, so
  // `schedules` is the best found so far rather than a guaranteed best.
  truncated: boolean;
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

function bundlesCompatible(a: Bundle, b: Bundle): boolean {
  const aMeetings = a.sections.flatMap((s) => s.meetings);
  const bMeetings = b.sections.flatMap((s) => s.meetings);
  return !aMeetings.some((m1) => bMeetings.some((m2) => meetingsOverlap(m1, m2)));
}

// Arc-consistency preprocessing: removes any bundle that can NEVER appear in
// a valid schedule — one that conflicts with every single option of some
// other course — before the exponential backtracking search even starts.
// This is exact and lossless (a removed bundle genuinely has zero chance of
// ever being used, regardless of what else gets picked), so it can only
// shrink the search space, never change which schedules are findable —
// verified against the same brute-force differential test that proves the
// search itself is exhaustive (see scheduler.exhaustiveness.test.ts).
//
// Runs as repeated full sweeps over every course pair until a full sweep
// removes nothing (a fixed point) — not the textbook AC-3 worklist queue,
// which only re-checks pairs actually affected by the last removal. That's
// a real optimization AC-3 has that this skips, but it only changes how
// many times cheap, polynomial preprocessing work gets redone — it doesn't
// change correctness or the end result, and this preprocessing is already
// negligible next to the exponential search it's protecting against, so
// the simpler repeated-sweep version isn't worth the extra bookkeeping.
export function applyArcConsistency(
  courseOrder: { courseCode: string; bundles: Bundle[] }[],
): { courseCode: string; bundles: Bundle[] }[] {
  const domains = courseOrder.map((c) => ({ courseCode: c.courseCode, bundles: [...c.bundles] }));

  let changed = true;
  while (changed) {
    changed = false;
    // Snapshot every course's bundle list at the START of this sweep, and
    // compute every course's survivors against that same snapshot — never
    // against another course's list as it's mid-update THIS sweep. Without
    // this, results become order-dependent: whichever course happens to be
    // checked first would "win" and empty the other one out, instead of
    // both correctly ending up empty together when they're genuinely
    // mutually exclusive (e.g. two courses whose only remaining options
    // directly conflict with each other — both have zero real options, not
    // just one of them, and which one "goes first" shouldn't decide that).
    // It's also what makes the empty-domain guard below actually correct:
    // a course already empty from an external reason (all-full,
    // not-offered, busy-conflict) reads as empty in the snapshot no matter
    // what, so it can never wrongly carry "incompatible with everything"
    // information to an unrelated course.
    const snapshot = domains.map((d) => d.bundles);

    for (let i = 0; i < domains.length; i++) {
      let survivors = snapshot[i];
      for (let j = 0; j < domains.length; j++) {
        if (i === j) continue;
        const otherBundles = snapshot[j];
        if (otherBundles.length === 0) continue; // empty domain = no constraint info, not "conflicts with everything"
        survivors = survivors.filter((bundle) => otherBundles.some((otherBundle) => bundlesCompatible(bundle, otherBundle)));
      }
      if (survivors.length !== domains[i].bundles.length) {
        domains[i].bundles = survivors;
        changed = true;
      }
    }
  }

  return domains;
}

export function generateSchedules(
  courseBundles: Record<string, Bundle[]>,
  preference: TimeRangePreference,
  gapPreference: GapPreference = "minimize",
  busyBlocks: BusyBlock[] = [],
  maxResults = 3,
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
): GenerateResult {
  const deadline = performance.now() + timeBudgetMs;
  const busyMeetings = busyBlocksToMeetings(busyBlocks);

  // Combines the old two-pass "figure out why a course is unschedulable"
  // loop and "build the filtered course order" loop into one, now that
  // there's a third reason (busy-conflict) to distinguish alongside the
  // existing not-offered/all-full ones.
  const unschedulableCourses: { courseCode: string; reason: UnschedulableReason }[] = [];
  const preArcConsistency = Object.entries(courseBundles).map(([courseCode, bundles]) => {
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
  });

  // Arc-consistency runs on the already-cleaned bundle lists above (no
  // point checking pairwise compatibility against a closed/self-conflicting
  // section that was already going to be filtered out) — it can only
  // shrink these lists further, never add back what's already gone. Sorted
  // AFTER pruning, so the ordering reacts to the real option counts. Biggest
  // course first: the gap bound in searchBestByGap can only be as tight as what
  // it knows about the courses still to come, so leaving the one with the most
  // options (e.g. 160 PHYS 40A combinations) for last made it nearly useless —
  // measured on real Winter 2027 sets, fewest-first hit the time budget on
  // 5-course sets that biggest-first finishes exactly in about 3 seconds.
  const courseOrder = applyArcConsistency(preArcConsistency).sort((a, b) => b.bundles.length - a.bundles.length);

  // A course that had valid options on its own can still end up with zero
  // after arc-consistency — that means every one of its sections is
  // mutually incompatible with some other SELECTED course (not a busy
  // block, already covered by "busy-conflict" above), a distinct and more
  // informative reason than the generic "no schedule possible" message.
  for (const { courseCode, bundles } of courseOrder) {
    if (bundles.length === 0 && !unschedulableCourses.some((u) => u.courseCode === courseCode)) {
      unschedulableCourses.push({ courseCode, reason: "course-conflict" });
    }
  }

  // The default "fewest gaps" ranking uses the pruned search, which skips
  // branches that can't make the top few (see searchBestByGap) instead of
  // walking every combination.
  if (gapPreference === "minimize") {
    const { selected, truncated } = searchBestByGap(courseOrder, preference, busyMeetings, maxResults, deadline);
    return {
      schedules: selected,
      anyValidSchedule: selected.length > 0,
      anyFitsTimeRange: selected.some((candidate) => candidate.fitsTimeRange),
      truncated,
      unschedulableCourses,
    };
  }

  // gapSign of 0 (for "none") makes the gap term drop out, so schedules are
  // ordered only by whether they fit the time window.
  // ("minimize" never gets here: it returned above.)
  const gapSign = gapPreference === "maximize" ? -1 : 0;

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
    truncated: false,
    unschedulableCourses,
  };
}
