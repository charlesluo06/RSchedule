import "dotenv/config";
import express from "express";
import { getCourseBundles } from "./services/courseService.js";
import { CandidateSchedule, Bundle } from "./types.js";
import { GapPreference, generateSchedules, TimeRangePreference } from "./services/scheduler.js";

const app = express();
app.use(express.json());

interface CoursesRequestBody {
  courseCodes: string[];
  termCode: string;
}

app.post("/courses", async (req, res) => {
  const { courseCodes, termCode } = req.body as CoursesRequestBody;

  if (!Array.isArray(courseCodes) || courseCodes.length === 0 || !termCode) {
    res.status(400).json({ error: "courseCodes (non-empty array) and termCode are required" });
    return;
  }

  try {
    const results = await Promise.all(
      courseCodes.map(async (courseCode) => ({
        courseCode,
        bundles: await getCourseBundles(courseCode, termCode),
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
    message = "No schedule fits your preferred time range. Showing the best available alternatives instead.";
  }

  res.json({
    schedules: result.schedules.map(serializeSchedule),
    message,
    unschedulableCourses: result.unschedulableCourses,
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
