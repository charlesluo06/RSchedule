// These types mirror backend/src/types.ts and the /terms, /courses, and
// /generate response shapes exactly — kept in sync by hand since the
// frontend and backend are separate projects with no shared package.

export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export interface Meeting {
  day: DayOfWeek;
  startTime: string; // "HH:MM", 24-hour
  endTime: string;
  building: string;
  room: string;
}

// One authored recurring commitment (a work shift, athletic practice, etc.)
// that the scheduler must never place a class on top of. Mirrors
// backend/src/types.ts's BusyBlock exactly, plus a frontend-only `id` used
// for React keys and removal-by-id — the backend simply ignores that extra
// key, same as any other unrecognized field would be.
export interface BusyBlock {
  id: string;
  label: string;
  days: DayOfWeek[]; // non-empty
  startTime: string; // "HH:MM"
  endTime: string; // strictly after startTime
  // Padding (minutes) applied AFTER endTime only (not before startTime) —
  // see backend/src/types.ts's BusyBlock for the full rationale. The
  // calendar still displays the raw, un-padded start/end time; this only
  // affects what the scheduler avoids.
  bufferMinutes: number;
}

export interface Section {
  crn: string;
  courseCode: string;
  sectionType: string; // "Lecture" / "Discussion" / "Laboratory" / "Seminar"
  linkId: string | null;
  meetings: Meeting[]; // empty = arranged/async, no fixed time
  seatsAvailable: number;
  maximumEnrollment: number;
  creditHours: number;
  instructor: string;
}

export interface Bundle {
  courseCode: string;
  sections: Section[];
}

export interface Term {
  code: string;
  description: string;
}

export interface CourseCodeOption {
  code: string;
  title: string;
}

export interface Subject {
  code: string;
  description: string;
}

// The "gap preference" toggle (minimize/spread/any) used to live here, but
// was removed once busy times gave real, precise control over what a
// schedule must avoid — the gap toggle was only ever a blunt way to get
// variety across the 3 ranked options. The backend's ranking still defaults
// to "minimize" internally on its own (see backend/src/services/scheduler.ts);
// this type just no longer needs to carry a user-facing choice for it.
export interface Preferences {
  startTime: string; // "HH:MM"
  endTime: string;
}

// The backend serializes CandidateSchedule's `selections` Map into a plain
// object (Object.fromEntries) before sending it — so on the frontend it's
// always a Record, never a Map. Iterate with Object.entries.
export interface SerializedSchedule {
  selections: Record<string, Bundle>;
  gapMinutes: number;
  fitsTimeRange: boolean;
}

export type UnschedulableReason = "not-offered" | "all-full" | "busy-conflict";

export interface GenerateResponse {
  schedules: SerializedSchedule[]; // up to 3, ranked best first
  message?: string;
  unschedulableCourses: { courseCode: string; reason: UnschedulableReason }[];
}
