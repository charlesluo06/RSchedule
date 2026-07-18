import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [copied, setCopied] = useState(false);

  function handleCopyCrn() {
    navigator.clipboard.writeText(section.crn);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Escape closes the modal, same as clicking outside it — a modal that
  // only responds to one dismissal method is a small but real usability gap.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Lock page scroll while the modal is open — otherwise the calendar
  // underneath keeps scrolling behind an overlay that's supposed to demand
  // full attention. Locking both <html> and <body> since which one actually
  // owns the scrollbar depends on the page's layout, and getting only one
  // of them leaves scrolling still possible. Restored on close/unmount.
  useEffect(() => {
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  // Rendered via a portal straight into <body> — the results card has
  // backdrop-blur-md on it, and CSS backdrop-filter on an ancestor creates a
  // new containing block for `position: fixed` descendants. Without the
  // portal, "fixed inset-0" would center itself relative to the card's full
  // scrollable height (which can be taller than the viewport) instead of
  // the viewport you're actually looking at — exactly the "centered in the
  // whole calendar, not where I'm scrolled to" bug this fixes.
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-white/30 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-fade-in w-full max-w-sm rounded-2xl border border-white/40 bg-white/60 p-6 shadow-xl
                   backdrop-blur-md ring-1 ring-black/5"
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
            <dd>
              <button
                type="button"
                onClick={handleCopyCrn}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#1a56db] px-2 py-1
                           font-mono text-white"
              >
                {copied ? (
                  "Copied!"
                ) : (
                  <>
                    {section.crn}
                    <svg
                      viewBox="0 0 20 20"
                      className="h-3.5 w-3.5 text-accent-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <rect x="7" y="7" width="10" height="10" rx="1.5" />
                      <path d="M4.5 12.5v-8a1 1 0 0 1 1-1h8" strokeLinecap="round" />
                    </svg>
                  </>
                )}
              </button>
            </dd>
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
    </div>,
    document.body,
  );
}

export default ClassDetailModal;
