import type { CourseColor } from "../lib/colors";
import { formatClock } from "../lib/time";
import CopyCrnButton from "./CopyCrnButton";

// The scheduler already filters out any section with 0 seats (see
// hasOpenSeats in the backend), so a rendered block is always >= 1 — this
// threshold is about flagging "about to disappear," not "already gone."
const LOW_SEATS_THRESHOLD = 5;

// Below this height (px) there's no room for the corner copy button without
// covering the block's own text.
const MIN_HEIGHT_FOR_COPY = 44;

// The underlying data (Section.sectionType) is the full word everywhere —
// only the compact/mobile pill is tight enough on space to need
// abbreviating, so that happens here, display-only, rather than shortening
// the data itself for every consumer.
const COMPACT_ABBREVIATIONS: Record<string, string> = {
  Lecture: "LEC",
  Discussion: "DIS",
  Laboratory: "LAB",
  Seminar: "SEM",
};

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
  const displaySectionType = compact ? COMPACT_ABBREVIATIONS[sectionType] ?? sectionType : sectionType;

  // The wrapper is a div (not the button) because the corner copy control is
  // itself a button, and a button nested in a button is invalid HTML. The
  // block's main click target is the inner button; the copy control is its
  // sibling, so clicking it never opens the modal.
  return (
    <div
      className="animate-fade-in absolute overflow-hidden rounded-lg border-2 border-black/10 text-white
                 shadow-sm transition-transform hover:z-10 hover:scale-[1.03] hover:shadow-lg
                 focus-within:z-10"
      style={{
        top,
        height,
        backgroundColor: color.solid,
        insetInline: compact ? 2 : 4,
      }}
    >
    <button
      type="button"
      onClick={onClick}
      className={`h-full w-full cursor-pointer leading-tight focus-visible:outline-2 focus-visible:-outline-offset-2
                 focus-visible:outline-white ${
                   compact ? "px-0.5 py-0.5 text-center text-[9px]" : "px-2 py-1 text-left text-xs"
                 }`}
    >
      {/* A thin white ring keeps this legible even against a hue close to
          its own red (rose especially) now that blocks are solid-colored
          instead of pale — on a pale background red always stood out on
          its own, that's no longer guaranteed. */}
      {isLowSeats && !compact && (
        <span
          className="absolute top-1 right-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none
                     text-white tabular-nums ring-2 ring-white"
          title={`Only ${seatsAvailable} seat${seatsAvailable === 1 ? "" : "s"} left`}
        >
          {seatsAvailable} left
        </span>
      )}
      {/* The pill is now white-on-color (inverted from the block's own
          solid background) instead of color-on-white, since the block
          itself became the vibrant surface — a same-color pill would've
          disappeared into it. flex-wrap lets the course code drop to its
          own line on very narrow blocks instead of squeezing the pill. */}
      <div className={`flex flex-wrap items-center gap-1 ${compact ? "justify-center" : ""}`}>
        <span className="wrap-break-word font-semibold">{courseCode}</span>
        <span
          className="inline-flex shrink-0 self-center items-center justify-center rounded-full bg-white px-1
                     py-0.5 text-[8px] font-bold leading-none"
          style={{ color: color.solid }}
        >
          {displaySectionType}
        </span>
      </div>
      {!compact && (
        <>
          <p className="tabular-nums opacity-90">
            {formatClock(startTime)}–{formatClock(endTime)}
          </p>
          <p className="opacity-90">{room}</p>
        </>
      )}
    </button>
    {!compact && height >= MIN_HEIGHT_FOR_COPY && (
      <CopyCrnButton
        crn={crn}
        className="absolute right-1 bottom-1 bg-white/90 px-1.5 py-1 hover:bg-white"
        style={{ color: color.solid }}
      />
    )}
    </div>
  );
}

export default CalendarBlock;
