import "dotenv/config";
import express from "express";
import cors from "cors";
import { getCourseBundles, getCourseCodesForSubject, getSectionAttributes, getSubjects } from "./services/courseService.js";
import { fetchTerms } from "./services/ucrClient.js";
import { isWithinRateLimit } from "./services/rateLimit.js";
import { CandidateSchedule, Bundle, BusyBlock, DayOfWeek } from "./types.js";
import { GapPreference, generateSchedules, TimeRangePreference } from "./services/scheduler.js";

const app = express();
// Vercel sits in front of this as a proxy — without trusting it, req.ip
// would resolve to Vercel's own internal address for every request, making
// every visitor look like the same client to the rate limiter below.
app.set("trust proxy", true);
// The frontend is deployed as a separate Vercel project (different origin),
// so unlike local dev — where Vite's proxy makes requests same-origin — the
// browser needs an explicit CORS allow to let those cross-origin calls through.
app.use(cors());
// Express's default JSON body limit is 100kb — fine for /courses (a small
// request), but /generate's request body embeds the full courseBundles data
// the client already fetched, and a course with many discussion/lab options
// (e.g. STAT010, ~166kb of bundle data) can exceed that easily since each
// bundle repeats full section objects across every combination.
app.use(express.json({ limit: "5mb" }));

// /health is exempt — it exists purely so an external pinger can keep the
// serverless function warm, and it never touches UCR or Redis, so there's
// no cost or abuse risk in leaving it unthrottled.
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Basic per-IP rate limit on everything else — protects against a scripted
// or accidental traffic spike running up Redis/Vercel usage, or sending more
// load at UCR's real registration system than organic usage ever would.
app.use(async (req, res, next) => {
  const allowed = await isWithinRateLimit(req.ip ?? "unknown");
  if (!allowed) {
    res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
    return;
  }
  next();
});

app.get("/terms", async (_req, res) => {
  try {
    res.json(await fetchTerms());
  } catch (err) {
    console.error("Failed to fetch terms from UCR:", err);
    res.status(502).json({ error: "Failed to load terms from UCR. Please try again shortly." });
  }
});

app.get("/subjects", async (req, res) => {
  const termCode = typeof req.query.term === "string" ? req.query.term : "";
  if (!termCode) {
    res.status(400).json({ error: "term query param is required" });
    return;
  }

  try {
    res.json(await getSubjects(termCode));
  } catch (err) {
    console.error(`Failed to fetch subjects for ${termCode}:`, err);
    res.status(502).json({ error: "Failed to load subjects from UCR. Please try again shortly." });
  }
});

app.get("/section-attributes", async (req, res) => {
  const crn = typeof req.query.crn === "string" ? req.query.crn : "";
  const termCode = typeof req.query.term === "string" ? req.query.term : "";

  if (!crn || !termCode) {
    res.status(400).json({ error: "crn and term query params are required" });
    return;
  }

  try {
    res.json(await getSectionAttributes(crn, termCode));
  } catch (err) {
    console.error(`Failed to fetch section attributes for CRN ${crn} (${termCode}):`, err);
    res.status(502).json({ error: "Failed to load section attributes from UCR. Please try again shortly." });
  }
});

app.get("/course-codes", async (req, res) => {
  const subject = typeof req.query.subject === "string" ? req.query.subject.toUpperCase() : "";
  const termCode = typeof req.query.term === "string" ? req.query.term : "";

  if (!subject || !termCode) {
    res.status(400).json({ error: "subject and term query params are required" });
    return;
  }

  try {
    res.json(await getCourseCodesForSubject(subject, termCode));
  } catch (err) {
    console.error(`Failed to fetch course codes for ${subject} (${termCode}):`, err);
    res.status(502).json({ error: "Failed to load course codes from UCR. Please try again shortly." });
  }
});

interface CoursesRequestBody {
  courseCodes: string[];
  termCode: string;
  forceRefresh?: boolean;
}

app.post("/courses", async (req, res) => {
  const { courseCodes, termCode, forceRefresh } = req.body as CoursesRequestBody;

  if (!Array.isArray(courseCodes) || courseCodes.length === 0 || !termCode) {
    res.status(400).json({ error: "courseCodes (non-empty array) and termCode are required" });
    return;
  }

  try {
    const results = await Promise.all(
      courseCodes.map(async (courseCode) => ({
        courseCode,
        bundles: await getCourseBundles(courseCode, termCode, forceRefresh),
      })),
    );

    const byCourseCode: Record<string, Awaited<ReturnType<typeof getCourseBundles>>> = {};
    for (const { courseCode, bundles } of results) {
      byCourseCode[courseCode] = bundles;
    }

    res.json(byCourseCode);
  } catch (err) {
    console.error("Failed to fetch course data from UCR:", err);
    res.status(502).json({ error: "Failed to fetch course data from UCR. Please try again shortly." });
  }
});

interface GenerateRequestBody {
  courseBundles: Record<string, Bundle[]>;
  preferences: TimeRangePreference & { gapPreference?: GapPreference };
  // Left untyped as BusyBlock here on purpose — it's client-supplied JSON,
  // not something this codebase produced, so it gets validated below before
  // ever being trusted as a real BusyBlock[].
  busyBlocks?: unknown;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_DAYS = new Set<DayOfWeek>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
const MAX_BUSY_BLOCKS = 20;
// Matches UCR's own back-to-back class scheduling (e.g. a 9:00-9:50 lecture
// immediately followed by a 10:00 one) — nobody can walk from a shift
// straight into a lecture the instant one ends, so this is the default
// padding applied after a busy block ends (not before it starts — see
// BusyBlock's own doc comment in types.ts for why) before it's checked
// against class times. Capped at 2 hours — beyond that a real commute is
// better modeled as a wider busy block, not a "buffer."
const DEFAULT_BUFFER_MINUTES = 10;
const MAX_BUFFER_MINUTES = 120;

// Unlike the rest of /generate's input — courseBundles is our own /courses
// output echoed back, and startTime/endTime come from a slider bounded to
// valid values — busy blocks are the first genuinely free-form user-authored
// structure this route accepts. A malformed one fails silently rather than
// loudly: timeToMinutes("garbage") is NaN, every comparison in
// meetingsOverlap comes back false, and the block is quietly ignored,
// handing back a schedule that violates the exact hard constraint the user
// asked for. That's worse than a rejected request, so this field gets real
// validation where the rest of the route deliberately doesn't.
// Exported so it can be unit-tested directly (see src/app.test.ts) without
// spinning up the whole Express app or hitting a real network call.
export function validateBusyBlocks(input: unknown): { ok: true; value: BusyBlock[] } | { ok: false; error: string } {
  if (input === undefined) return { ok: true, value: [] }; // omitted entirely = no busy blocks, backwards compatible
  if (!Array.isArray(input)) return { ok: false, error: "busyBlocks must be an array" };
  if (input.length > MAX_BUSY_BLOCKS) {
    return { ok: false, error: `busyBlocks cannot exceed ${MAX_BUSY_BLOCKS} entries` };
  }

  const value: BusyBlock[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "each busy block must be an object" };
    const { label, days, startTime, endTime, bufferMinutes: rawBuffer } = raw as Record<string, unknown>;

    if (!Array.isArray(days) || days.length === 0 || !days.every((d) => VALID_DAYS.has(d as DayOfWeek))) {
      return { ok: false, error: "each busy block needs a non-empty days array of Mon/Tue/Wed/Thu/Fri" };
    }
    if (typeof startTime !== "string" || !HHMM_RE.test(startTime)) {
      return { ok: false, error: "busy block startTime must be an HH:MM string" };
    }
    if (typeof endTime !== "string" || !HHMM_RE.test(endTime)) {
      return { ok: false, error: "busy block endTime must be an HH:MM string" };
    }
    // Safe as a plain string comparison since both sides are already
    // confirmed zero-padded "HH:MM" by the regex above.
    if (startTime >= endTime) {
      return { ok: false, error: "busy block startTime must be before endTime" };
    }
    const bufferMinutes = rawBuffer === undefined ? DEFAULT_BUFFER_MINUTES : rawBuffer;
    if (
      typeof bufferMinutes !== "number" ||
      !Number.isInteger(bufferMinutes) ||
      bufferMinutes < 0 ||
      bufferMinutes > MAX_BUFFER_MINUTES
    ) {
      return { ok: false, error: `busy block bufferMinutes must be an integer from 0 to ${MAX_BUFFER_MINUTES}` };
    }

    value.push({
      label: typeof label === "string" ? label.slice(0, 40) : "",
      days: [...new Set(days as DayOfWeek[])],
      startTime,
      endTime,
      bufferMinutes,
    });
  }
  return { ok: true, value };
}

// A CandidateSchedule's `selections` is a Map, which JSON.stringify can't
// serialize meaningfully (it would come out as "{}"). Convert it to a plain
// object keyed by courseCode before sending it over HTTP.
function serializeSchedule(schedule: CandidateSchedule) {
  return {
    selections: Object.fromEntries(schedule.selections),
    gapMinutes: schedule.gapMinutes,
    fitsTimeRange: schedule.fitsTimeRange,
  };
}

app.post("/generate", (req, res) => {
  const { courseBundles, preferences, busyBlocks: rawBusyBlocks } = req.body as GenerateRequestBody;

  if (!courseBundles || Object.keys(courseBundles).length === 0 || !preferences?.startTime || !preferences?.endTime) {
    res.status(400).json({ error: "courseBundles and preferences (startTime, endTime) are required" });
    return;
  }

  const busyBlocksResult = validateBusyBlocks(rawBusyBlocks);
  if (!busyBlocksResult.ok) {
    res.status(400).json({ error: busyBlocksResult.error });
    return;
  }
  const busyBlocks = busyBlocksResult.value;

  const { startTime, endTime, gapPreference = "minimize" } = preferences;
  const result = generateSchedules(courseBundles, { startTime, endTime }, gapPreference, busyBlocks);

  let message: string | undefined;
  if (!result.anyValidSchedule) {
    if (result.unschedulableCourses.length > 0) {
      const details = result.unschedulableCourses
        .map(({ courseCode, reason }) =>
          reason === "not-offered"
            ? `${courseCode} has no sections offered this term`
            : reason === "all-full"
              ? `${courseCode}'s sections are all full`
              : `${courseCode} only has sections that overlap your busy times`,
        )
        .join("; ");
      message = `No schedule is possible: ${details}.`;
    } else if (busyBlocks.length > 0) {
      message = "No conflict-free schedule is possible around your busy times — try shortening or removing one.";
    } else {
      message =
        "No conflict-free schedule is possible — these courses' meeting times don't leave any way to avoid overlaps.";
    }
  } else if (!result.anyFitsTimeRange) {
    message = "No schedule fits your preferred time range. Try widening it to see available options.";
  }

  res.json({
    schedules: result.schedules.map(serializeSchedule),
    message,
    unschedulableCourses: result.unschedulableCourses,
  });
});

export default app;
