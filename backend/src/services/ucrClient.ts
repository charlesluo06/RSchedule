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
 * Negotiates the session cookie and selects the term — the two steps of
 * Banner's handshake that only depend on the term, not on what's being
 * searched for. Safe to reuse across many searches.
 */
async function negotiateBaseCookies(termCode: string): Promise<CookieJar> {
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

  return jar;
}

// Re-negotiating the base cookies is what made autocomplete slow (every
// search redid this 2-request handshake first). It doesn't depend on
// anything but the term, so it's cached briefly and reused.
const SESSION_TTL_MS = 5 * 60 * 1000;
const sessionCache = new Map<string, { jar: CookieJar; expiresAt: number }>();

async function getBaseSession(termCode: string): Promise<{ jar: CookieJar; isFresh: boolean }> {
  const cached = sessionCache.get(termCode);
  if (cached && cached.expiresAt > Date.now()) {
    return { jar: cached.jar, isFresh: false };
  }
  const jar = await negotiateBaseCookies(termCode);
  sessionCache.set(termCode, { jar, expiresAt: Date.now() + SESSION_TTL_MS });
  return { jar, isFresh: true };
}

// Banner's search results are stateful per session, not just per request:
// `resetDataForm` has to run immediately before EVERY individual search, and
// only one search can be in flight on a given session at a time — running
// two searches concurrently on the same session causes Banner to hand back
// one search's results for the other (confirmed: fetching CS100 then CS061
// on a reused session returned identical, wrong section data for both).
// Reusing the base cookies is still a win (skips the 2-request cookie/term
// dance), but the reset+search pair itself must be serialized per term.
const searchQueues = new Map<string, Promise<unknown>>();

function runSerialized<T>(termCode: string, task: () => Promise<T>): Promise<T> {
  const previous = searchQueues.get(termCode) ?? Promise.resolve();
  const chained = previous.then(task, task);
  searchQueues.set(termCode, chained.catch(() => undefined));
  return chained;
}

async function withSearchSession<T>(termCode: string, search: (jar: CookieJar) => Promise<T>): Promise<T> {
  return runSerialized(termCode, async () => {
    const { jar, isFresh } = await getBaseSession(termCode);
    // A just-negotiated session has never run a search on Banner's end, so
    // there's no stale form state to reset yet — skipping this here shaves
    // a full round-trip off the (already slow, first-of-a-term) cold path.
    // Every subsequent search on a REUSED session still resets first, since
    // that's what fixed the real cross-search data-collision bug.
    if (!isFresh) {
      const reset = await fetch(`${BASE}/classSearch/resetDataForm?resetTerm=${termCode}`, {
        headers: { "User-Agent": "Mozilla/5.0", Cookie: jar.header() },
      });
      jar.absorb(reset);
    }
    return search(jar);
  });
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

export interface Subject {
  code: string; // e.g. "PSYC"
  description: string; // e.g. "Psychology"
}

/**
 * Fetches UCR's full list of subject codes for a term. Needed because
 * subject codes vary in length (2-4+ letters) and UCR's search does an
 * EXACT match on subject — searching "PS" (a prefix of "PSYC") returns zero
 * results, it does NOT prefix-match. So autocomplete needs this real list
 * to know which complete subject(s) a partial prefix like "PS" could mean,
 * rather than assuming whatever's typed so far IS the whole subject code.
 */
export async function fetchSubjects(termCode: string): Promise<Subject[]> {
  return withSearchSession(termCode, async (jar) => {
    const response = await fetch(`${BASE}/classSearch/get_subject?searchTerm=&term=${termCode}&offset=1&max=500`, {
      headers: { "User-Agent": "Mozilla/5.0", Cookie: jar.header() },
    });
    if (!response.ok) {
      throw new Error(`UCR get_subject failed with status ${response.status}`);
    }
    return (await response.json()) as Subject[];
  });
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

  const sections = await withSearchSession(termCode, async (jar) => {
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

    return body.data.map(normalizeSection);
  });

  return groupIntoBundles(courseCode, sections);
}

export interface CourseCodeOption {
  code: string;
  title: string;
}

interface RawCourseListItem {
  subjectCourse: string;
  courseTitle: string;
}

/**
 * Fetches every course code offered under one subject (e.g. "CS") for a
 * term — powers the course-code autocomplete. Lighter than
 * fetchCourseBundles: no course-number filter (we want the WHOLE subject),
 * and we only need code + title, not full section/meeting data.
 */
export async function fetchCourseCodesForSubject(subject: string, termCode: string): Promise<CourseCodeOption[]> {
  return withSearchSession(termCode, async (jar) => {
    const params = new URLSearchParams({
      txt_subject: subject,
      txt_term: termCode,
      uniqueSessionId: randomSessionId(),
      pageOffset: "0",
      pageMaxSize: "1000",
      sortColumn: "subjectDescription",
      sortDirection: "asc",
    });

    const response = await fetch(`${BASE}/searchResults/searchResults?${params}`, {
      headers: { "User-Agent": "Mozilla/5.0", Cookie: jar.header() },
    });

    if (!response.ok) {
      throw new Error(`UCR search failed with status ${response.status}`);
    }

    const body = (await response.json()) as { success: boolean; data: RawCourseListItem[] };
    if (!body.success) {
      throw new Error("UCR search reported failure");
    }

    // A subject search returns one row per SECTION, not per course — many
    // rows share the same subjectCourse (e.g. every CS005 lecture/discussion).
    // Dedupe down to one entry per unique course code.
    const seen = new Map<string, string>();
    for (const item of body.data) {
      if (!seen.has(item.subjectCourse)) {
        seen.set(item.subjectCourse, item.courseTitle);
      }
    }
    return [...seen.entries()].map(([code, title]) => ({ code, title }));
  });
}
