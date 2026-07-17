import type { UnschedulableReason } from "../types";

interface UnschedulableCourse {
  courseCode: string;
  reason: UnschedulableReason;
}

interface UnschedulableBadgesProps {
  courses: UnschedulableCourse[];
}

const REASON_LABELS: Record<UnschedulableReason, string> = {
  "not-offered": "not offered this term",
  "all-full": "all sections full",
};

function UnschedulableBadges({ courses }: UnschedulableBadgesProps) {
  if (courses.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {courses.map(({ courseCode, reason }) => (
        <span
          key={courseCode}
          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
        >
          {courseCode} — {REASON_LABELS[reason]}
        </span>
      ))}
    </div>
  );
}

export default UnschedulableBadges;
