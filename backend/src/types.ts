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

export interface Section {
  crn: string;
  courseCode: string; // e.g. "MATH003"
  sectionType: string; // "LEC" / "DIS" / "LAB"
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
