import { useEffect } from "react";
import type { Section } from "../types";
import type { CourseColor } from "../lib/colors";
import { formatClock } from "../lib/time";

interface ClassDetailModalProps {
  courseCode: string;
  section: Section;
  color: CourseColor;
  onClose: () => void;
}

function ClassDetailModal({ courseCode, section, color, onClose }: ClassDetailModalProps) {
  // Escape closes the modal, same as clicking outside it — a modal that
  // only responds to one dismissal method is a small but real usability gap.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-fade-in w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="class-detail-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span
              className="inline-flex rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: color.bg, color: color.text }}
            >
              {section.sectionType}
            </span>
            <h2 id="class-detail-title" className="mt-1.5 text-lg font-semibold text-primary-700">
              {courseCode}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        <dl className="mt-4 flex flex-col gap-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Instructor</dt>
            <dd className="text-right font-medium text-neutral-900">{section.instructor}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">CRN</dt>
            <dd className="font-mono text-neutral-900">{section.crn}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Seats available</dt>
            <dd className="font-medium text-neutral-900 tabular-nums">
              {section.seatsAvailable} / {section.maximumEnrollment}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-neutral-500">Meeting times</dt>
            <dd>
              {section.meetings.length === 0 ? (
                <p className="text-neutral-700">Arranged/online — no fixed meeting time</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {section.meetings.map((m, i) => (
                    <li key={i} className="text-neutral-700 tabular-nums">
                      {m.day} {formatClock(m.startTime)}–{formatClock(m.endTime)} · {m.building} {m.room}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default ClassDetailModal;
