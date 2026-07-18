import "dotenv/config";
import express from "express";
import cors from "cors";
import { getCourseBundles, getCourseCodesForSubject, getSubjects } from "./services/courseService.js";
import { fetchTerms } from "./services/ucrClient.js";
import { CandidateSchedule, Bundle } from "./types.js";
import { GapPreference, generateSchedules, TimeRangePreference } from "./services/scheduler.js";

const app = express();
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
  const { courseBundles, preferences } = req.body as GenerateRequestBody;

  if (!courseBundles || Object.keys(courseBundles).length === 0 || !preferences?.startTime || !preferences?.endTime) {
    res.status(400).json({ error: "courseBundles and preferences (startTime, endTime) are required" });
    return;
  }

  const { startTime, endTime, gapPreference = "minimize" } = preferences;
  const result = generateSchedules(courseBundles, { startTime, endTime }, gapPreference);

  let message: string | undefined;
  if (!result.anyValidSchedule) {
    if (result.unschedulableCourses.length > 0) {
      const details = result.unschedulableCourses
        .map(({ courseCode, reason }) =>
          reason === "not-offered"
            ? `${courseCode} has no sections offered this term`
            : `${courseCode}'s sections are all full`,
        )
        .join("; ");
      message = `No schedule is possible: ${details}.`;
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
