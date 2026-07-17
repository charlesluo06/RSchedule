import { useState } from "react";
import { normalizeCourseCode } from "../lib/normalize";

interface CourseChipInputProps {
  courseCodes: string[];
  onChange: (codes: string[]) => void;
}

function CourseChipInput({ courseCodes, onChange }: CourseChipInputProps) {
  const [draft, setDraft] = useState("");

  function addCourse() {
    const code = normalizeCourseCode(draft);
    if (code && !courseCodes.includes(code)) {
      onChange([...courseCodes, code]);
    }
    setDraft("");
  }

  function removeCourse(code: string) {
    onChange(courseCodes.filter((c) => c !== code));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-primary-700">Courses</span>

      {courseCodes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {courseCodes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1
                         text-sm font-medium text-primary-700"
            >
              {code}
              <button
                type="button"
                onClick={() => removeCourse(code)}
                aria-label={`Remove ${code}`}
                className="cursor-pointer text-primary-500 hover:text-primary-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addCourse();
          }
        }}
        placeholder="e.g. CS010"
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-neutral-900
                   placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
  );
}

export default CourseChipInput;
