import "dotenv/config";
import express from "express";
import { getCourseBundles } from "./services/courseService.js";

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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
