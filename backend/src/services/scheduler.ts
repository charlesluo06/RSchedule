import { Bundle, CandidateSchedule, Meeting } from "../types.js";

export interface TimeRangePreference {
  startTime: string; // "HH:MM", earliest acceptable class start
  endTime: string; // "HH:MM", latest acceptable class end
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
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
 * turn, pruning only branches that create an actual time conflict, and
 * collects every complete, non-conflicting schedule it finds.
 */
function search(
  courseOrder: { courseCode: string; bundles: Bundle[] }[],
  index: number,
  selections: Map<string, Bundle>,
  placedMeetings: Meeting[],
  results: Map<string, Bundle>[],
): void {
  if (index === courseOrder.length) {
    results.push(new Map(selections));
    return;
  }

  const { courseCode, bundles } = courseOrder[index];
  for (const bundle of bundles) {
    if (bundleConflictsWithPlaced(bundle, placedMeetings)) continue;

    selections.set(courseCode, bundle);
    const newMeetings = bundle.sections.flatMap((s) => s.meetings);
    search(courseOrder, index + 1, selections, [...placedMeetings, ...newMeetings], results);
    selections.delete(courseCode);
  }
}

function scheduleKey(selections: Map<string, Bundle>): string {
  return [...selections.values()]
    .flatMap((b) => b.sections.map((s) => s.crn))
    .sort()
    .join(",");
}

export interface GenerateResult {
  schedules: CandidateSchedule[];
  anyValidSchedule: boolean;
  anyFitsTimeRange: boolean;
}

export function generateSchedules(
  courseBundles: Record<string, Bundle[]>,
  preference: TimeRangePreference,
  maxResults = 3,
): GenerateResult {
  // Most-constrained-first: courses with fewer options get tried first,
  // so branches that will fail get pruned as early as possible.
  const courseOrder = Object.entries(courseBundles)
    .map(([courseCode, bundles]) => ({ courseCode, bundles }))
    .sort((a, b) => a.bundles.length - b.bundles.length);

  const rawResults: Map<string, Bundle>[] = [];
  search(courseOrder, 0, new Map(), [], rawResults);

  const scored: CandidateSchedule[] = rawResults.map((selections) => {
    const meetings = allMeetings(selections);
    return {
      selections,
      gapMinutes: computeGapMinutes(meetings),
      fitsTimeRange: computeFitsTimeRange(meetings, preference),
    };
  });

  scored.sort((a, b) => {
    if (a.fitsTimeRange !== b.fitsTimeRange) return a.fitsTimeRange ? -1 : 1;
    return a.gapMinutes - b.gapMinutes;
  });

  const selected: CandidateSchedule[] = [];
  const seenKeys = new Set<string>();
  for (const candidate of scored) {
    const key = scheduleKey(candidate.selections);
    if (seenKeys.has(key)) continue; // identical schedule, not a meaningfully distinct option
    seenKeys.add(key);
    selected.push(candidate);
    if (selected.length === maxResults) break;
  }

  return {
    schedules: selected,
    anyValidSchedule: scored.length > 0,
    anyFitsTimeRange: scored.some((s) => s.fitsTimeRange),
  };
}
