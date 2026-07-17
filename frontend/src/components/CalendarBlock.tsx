import type { CourseColor } from "../lib/colors";
import { formatClock } from "../lib/time";

// The scheduler already filters out any section with 0 seats (see
// hasOpenSeats in the backend), so a rendered block is always >= 1 — this
// threshold is about flagging "about to disappear," not "already gone."
const LOW_SEATS_THRESHOLD = 5;

interface CalendarBlockProps {
  top: number; // px from the top of the day column
  height: number; // px tall
  color: CourseColor;
  courseCode: string;
  sectionType: string;
  crn: string;
  room: string;
  startTime: string;
  endTime: string;
  seatsAvailable: number;
  onClick: () => void;
}

function CalendarBlock({
  top,
  height,
  color,
  courseCode,
  sectionType,
  crn,
  room,
  startTime,
  endTime,
  seatsAvailable,
  onClick,
}: CalendarBlockProps) {
  const isLowSeats = seatsAvailable <= LOW_SEATS_THRESHOLD;

  return (
    <button
      type="button"
      onClick={onClick}
      className="animate-fade-in absolute inset-x-1 cursor-pointer overflow-hidden rounded-lg border px-2 py-1 text-left
                 text-xs leading-tight transition-transform hover:z-10 hover:scale-[1.03] hover:shadow-md
                 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1"
      style={{
        top,
        height,
        backgroundColor: color.bg,
        borderColor: color.border,
        color: color.text,
        outlineColor: color.text,
      }}
    >
      {isLowSeats && (
        <span
          className="absolute top-1 right-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none
                     text-white tabular-nums"
          title={`Only ${seatsAvailable} seat${seatsAvailable === 1 ? "" : "s"} left`}
        >
          {seatsAvailable} left
        </span>
      )}
      <p className="font-semibold">
        {courseCode} {sectionType}
      </p>
      <p className="tabular-nums opacity-80">
        {formatClock(startTime)}–{formatClock(endTime)}
      </p>
      <p className="opacity-80">{room}</p>
      <p className="font-mono opacity-70">CRN {crn}</p>
    </button>
  );
}

export default CalendarBlock;
