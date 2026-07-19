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
  // On the mobile zoomed-out week view, rows are too short to show every
  // detail without it turning to noise — just the course title shows, and
  // the rest (time/room/CRN/seats) is a tap away via the existing modal.
  compact: boolean;
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
  compact,
  onClick,
}: CalendarBlockProps) {
  const isLowSeats = seatsAvailable <= LOW_SEATS_THRESHOLD;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`animate-fade-in absolute cursor-pointer overflow-hidden rounded-lg border text-left
                 leading-tight transition-transform hover:z-10 hover:scale-[1.03] hover:shadow-md
                 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 ${
                   compact ? "inset-x-0.5 px-0.5 py-0.5 text-[9px]" : "inset-x-1 px-2 py-1 text-xs"
                 }`}
      style={{
        top,
        height,
        backgroundColor: color.bg,
        borderColor: color.border,
        color: color.text,
        outlineColor: color.text,
      }}
    >
      {isLowSeats && !compact && (
        <span
          className="absolute top-1 right-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none
                     text-white tabular-nums"
          title={`Only ${seatsAvailable} seat${seatsAvailable === 1 ? "" : "s"} left`}
        >
          {seatsAvailable} left
        </span>
      )}
      {/* Wraps onto a second line instead of truncating with an ellipsis —
          the space between courseCode and sectionType is a natural word
          break, so it never splits mid-word. The button's own
          overflow-hidden clips anything beyond that (e.g. a third line on
          a very short block) so it can never visually spill past the box. */}
      <p className="wrap-break-word font-semibold">
        {courseCode} {sectionType}
      </p>
      {!compact && (
        <>
          <p className="tabular-nums opacity-80">
            {formatClock(startTime)}–{formatClock(endTime)}
          </p>
          <p className="opacity-80">{room}</p>
          <p className="font-mono opacity-70">CRN {crn}</p>
        </>
      )}
    </button>
  );
}

export default CalendarBlock;
