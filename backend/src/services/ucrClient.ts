import { Bundle, DayOfWeek, Meeting, Section } from "../types.js";

const BASE = "https://registrationssb.ucr.edu/StudentRegistrationSsb/ssb";

// Banner tags each meeting with a boolean per weekday instead of a list.
// This maps that shape onto our DayOfWeek strings so we can loop over it.
const DAY_FLAGS: { flag: string; day: DayOfWeek }[] = [
  { flag: "monday", day: "Mon" },
  { flag: "tuesday", day: "Tue" },
  { flag: "wednesday", day: "Wed" },
  { flag: "thursday", day: "Thu" },
  { flag: "friday", day: "Fri" },
];

// Banner's cookies aren't handled for us the way a browser would — Node's
// fetch() doesn't keep a cookie jar. So we track the raw Set-Cookie values
// ourselves and replay them as the Cookie header on every later request.
class CookieJar {
  private cookies = new Map<string, string>();

  absorb(response: Response) {
    // Node's fetch exposes multiple Set-Cookie headers via getSetCookie().
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";"); // drop attributes like Path=/, Secure
      const eq = pair.indexOf("=");
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

function randomSessionId(): string {
  // Only needs to be unique-looking, not cryptographically secure — Banner
  // uses it purely as a log-correlation id, not a security credential.
  return `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Performs the three-step handshake Banner requires before searchResults
 * will return real data: pick up a session cookie, tell the server which
 * term we're searching, then reset any stale search-form state tied to
 * that session.
 */
async function establishSession(termCode: string): Promise<CookieJar> {
  const jar = new CookieJar();
  const headers = { "User-Agent": "Mozilla/5.0" };

  const step1 = await fetch(`${BASE}/term/termSelection?mode=search`, { headers });
  jar.absorb(step1);

  const step2 = await fetch(`${BASE}/term/search?mode=search`, {
    method: "POST",
    headers: { ...headers, Cookie: jar.header(), "Content-Type": "application/x-www-form-urlencoded" },
    body: `term=${termCode}`,
  });
  jar.absorb(step2);

  const step3 = await fetch(`${BASE}/classSearch/resetDataForm?resetTerm=${termCode}`, {
    headers: { ...headers, Cookie: jar.header() },
  });
  jar.absorb(step3);

  return jar;
}

export interface Term {
  code: string; // numeric term code, e.g. "202540" — what /courses expects
  description: string; // human label, e.g. "Fall 2025"
}

/**
 * Fetches UCR's list of available terms. Only needs the first handshake step
 * (pick up a session cookie) — not the full term-selection dance — because
 * getTerms doesn't depend on a term already being chosen.
 */
export async function fetchTerms(): Promise<Term[]> {
  const jar = new CookieJar();
  const headers = { "User-Agent": "Mozilla/5.0" };

  const step1 = await fetch(`${BASE}/term/termSelection?mode=search`, { headers });
  jar.absorb(step1);

  const response = await fetch(`${BASE}/classSearch/getTerms?searchTerm=&offset=1&max=25`, {
    headers: { ...headers, Cookie: jar.header() },
  });
  if (!response.ok) {
    throw new Error(`UCR getTerms failed with status ${response.status}`);
  }
  return (await response.json()) as Term[];
}

interface RawMeetingTime {
  beginTime: string; // "HHMM", e.g. "1000"
  endTime: string;
  building: string;
  room: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
}

interface RawSection {
  courseReferenceNumber: string;
  subjectCourse: string;
  scheduleTypeDescription: string;
  linkIdentifier: string | null;
  seatsAvailable: number;
  maximumEnrollment: number;
  faculty: { displayName: string; primaryIndicator: boolean }[];
  meetingsFaculty: { meetingTime: RawMeetingTime }[];
}

function toClockString(hhmm: string): string {
  // Banner sends "1000" meaning 10:00 — pad in case a time like "900" loses
  // its leading zero, then slice into HH:MM.
  const padded = hhmm.padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2)}`;
}

function normalizeSection(raw: RawSection): Section {
  const meetings: Meeting[] = [];
  for (const m of raw.meetingsFaculty) {
    const t = m.meetingTime;
    for (const { flag, day } of DAY_FLAGS) {
      if ((t as unknown as Record<string, boolean>)[flag]) {
        meetings.push({
          day,
          startTime: toClockString(t.beginTime),
          endTime: toClockString(t.endTime),
          building: t.building,
          room: t.room,
        });
      }
    }
  }

  const primaryFaculty = raw.faculty.find((f) => f.primaryIndicator) ?? raw.faculty[0];

  return {
    crn: raw.courseReferenceNumber,
    courseCode: raw.subjectCourse,
    sectionType: scheduleTypeAbbreviation(raw.scheduleTypeDescription),
    linkId: raw.linkIdentifier,
    meetings,
    seatsAvailable: raw.seatsAvailable,
    maximumEnrollment: raw.maximumEnrollment,
    instructor: primaryFaculty?.displayName ?? "Staff",
  };
}

function scheduleTypeAbbreviation(description: string): string {
  const known: Record<string, string> = {
    Lecture: "LEC",
    Discussion: "DIS",
    Laboratory: "LAB",
    Seminar: "SEM",
  };
  return known[description] ?? description;
}

/**
 * Groups a course's sections into Bundles by linkIdentifier — the atomic
 * unit the backtracking search will pick from. A section with no linkId
 * (not tied to any other section) becomes its own single-section bundle.
 *
 * Banner's linkIdentifier looks like "<TypeLetter><GroupNumber>" (e.g. "L1",
 * "D1", "B1") — sections sharing the same GROUP NUMBER are linked, even
 * though the letter differs. Confirmed against Banner's own getLinkedSections
 * endpoint: CS005's "L1" lecture links to its "B1" lab, and MATH009A's "L1"
 * lecture links to all five "D1" discussions.
 *
 * When a group has multiple sections of the *same* type (e.g. two lecture
 * options both tagged "L1", or five discussion options tagged "D1"), those
 * are alternatives, not a package — a student picks exactly one of each
 * type present in the group. So a group produces one Bundle per
 * combination: one lecture option * one discussion option * one lab option,
 * etc. (verified: CS061's two "L1" lectures each link to all four "B1" labs).
 */
function groupNumber(linkId: string): string {
  return linkId.match(/\d+$/)?.[0] ?? linkId;
}

function cartesianProduct<T>(groups: T[][]): T[][] {
  return groups.reduce<T[][]>(
    (combosSoFar, group) => combosSoFar.flatMap((combo) => group.map((item) => [...combo, item])),
    [[]],
  );
}

function groupIntoBundles(courseCode: string, sections: Section[]): Bundle[] {
  const byGroupNumber = new Map<string, Section[]>();
  const solo: Section[] = [];

  for (const section of sections) {
    if (section.linkId === null) {
      solo.push(section);
    } else {
      const key = groupNumber(section.linkId);
      const group = byGroupNumber.get(key) ?? [];
      group.push(section);
      byGroupNumber.set(key, group);
    }
  }

  const bundles: Bundle[] = [];
  for (const groupSections of byGroupNumber.values()) {
    const byType = new Map<string, Section[]>();
    for (const section of groupSections) {
      const options = byType.get(section.sectionType) ?? [];
      options.push(section);
      byType.set(section.sectionType, options);
    }
    for (const combo of cartesianProduct([...byType.values()])) {
      bundles.push({ courseCode, sections: combo });
    }
  }
  for (const section of solo) {
    bundles.push({ courseCode, sections: [section] });
  }
  return bundles;
}

/**
 * Fetches every section for one course code (e.g. "CS010") in the given
 * term, and returns them grouped into Bundles ready for the scheduler.
 */
export async function fetchCourseBundles(courseCode: string, termCode: string): Promise<Bundle[]> {
  const subject = courseCode.match(/^[A-Za-z]+/)?.[0] ?? "";
  const courseNumber = courseCode.slice(subject.length);

  const jar = await establishSession(termCode);

  const params = new URLSearchParams({
    txt_subject: subject,
    txt_courseNumber: courseNumber,
    txt_term: termCode,
    uniqueSessionId: randomSessionId(),
    pageOffset: "0",
    pageMaxSize: "50",
    sortColumn: "subjectDescription",
    sortDirection: "asc",
  });

  const response = await fetch(`${BASE}/searchResults/searchResults?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0", Cookie: jar.header() },
  });

  if (!response.ok) {
    throw new Error(`UCR search failed with status ${response.status}`);
  }

  const body = (await response.json()) as { success: boolean; data: RawSection[] };
  if (!body.success) {
    throw new Error("UCR search reported failure");
  }

  const sections = body.data.map(normalizeSection);
  return groupIntoBundles(courseCode, sections);
}
