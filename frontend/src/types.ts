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

export interface Section {
  crn: string;
  courseCode: string;
  sectionType: string; // "LEC" / "DIS" / "LAB"
  linkId: string | null;
  meetings: Meeting[]; // empty = arranged/async, no fixed time
  seatsAvailable: number;
  maximumEnrollment: number;
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

// "minimize" = Packed, "maximize" = Spread, "none" = Any (don't care about gaps).
export type GapPreference = "minimize" | "maximize" | "none";

export interface Preferences {
  startTime: string; // "HH:MM"
  endTime: string;
  gapPreference: GapPreference;
}

// The backend serializes CandidateSchedule's `selections` Map into a plain
// object (Object.fromEntries) before sending it — so on the frontend it's
// always a Record, never a Map. Iterate with Object.entries.
export interface SerializedSchedule {
  selections: Record<string, Bundle>;
  gapMinutes: number;
  fitsTimeRange: boolean;
}

export type UnschedulableReason = "not-offered" | "all-full";

export interface GenerateResponse {
  schedules: SerializedSchedule[]; // up to 3, ranked best first
  message?: string;
  unschedulableCourses: { courseCode: string; reason: UnschedulableReason }[];
}
