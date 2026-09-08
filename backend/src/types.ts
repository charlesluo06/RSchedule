// Days are stored as these exact strings so every part of the app agrees
// on how to spell "Monday" — no risk of one place using "Mon" and another "M".
export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export interface Meeting {
  day: DayOfWeek;
  startTime: string; // "HH:MM" in 24-hour time, e.g. "09:00"
  endTime: string;
  building: string;
  room: string;
}

// One authored recurring commitment (a work shift, athletic practice, etc.)
// that the scheduler must never place a class on top of. Days are a set
// here (one "Work" block covers MWF) — the scheduler expands this into N
// single-day Meeting-shaped records, the same precedent already used for
// how an MWF class is stored as 3 separate Meetings, not one multi-day one.
export interface BusyBlock {
  label: string;
  days: DayOfWeek[]; // non-empty
  startTime: string; // "HH:MM"
  endTime: string; // strictly after startTime
  // Realistically nobody can walk straight from a shift into a lecture the
  // same minute it ends — this pads the block's effective conflict window
  // by this many minutes AFTER endTime only before it's checked against
  // class times (matching UCR's own ~10-minute back-to-back class gap). Not
  // applied before startTime: getting TO a busy block already has slack
  // baked in from the class side of things (a lecture ending :50 past the
  // hour before the block starts on the hour), so only the far side
  // actually needed padding. Purely a scheduling constraint — the calendar
  // still displays the block's real, un-padded start/end time.
  bufferMinutes: number;
}

export interface Section {
  crn: string;
  courseCode: string; // e.g. "MATH003"
  sectionType: string; // "Lecture" / "Discussion" / "Laboratory" / "Seminar"
  linkId: string | null;
  meetings: Meeting[];
  seatsAvailable: number;
  maximumEnrollment: number;
  creditHours: number;
  instructor: string;
}

export interface Bundle {
  courseCode: string;
  sections: Section[];
}

export interface CandidateSchedule {
  selections: Map<string, Bundle>; // keyed by courseCode
  gapMinutes: number;
  fitsTimeRange: boolean;
}
