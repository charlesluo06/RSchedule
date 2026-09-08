import { formatClock } from "../lib/time";

interface BusyCalendarBlockProps {
  top: number; // px from the top of the day column
  height: number; // px tall
  label: string;
  startTime: string;
  endTime: string;
  compact: boolean;
}

// Deliberately not a variant of CalendarBlock — that component is a clickable
// button carrying class-only fields (seatsAvailable, sectionType, onClick)
// that don't apply to a busy block. This is a plain, non-interactive <div>:
// muted neutral fill with a diagonal hatch so it reads as "unavailable
// background" rather than another class competing for attention, dashed
// border to further distinguish it from a real (solid-border) class block.
function BusyCalendarBlock({ top, height, label, startTime, endTime, compact }: BusyCalendarBlockProps) {
  return (
    <div
      aria-hidden="true"
      className={`absolute overflow-hidden rounded-lg border-2 border-dashed border-neutral-400 leading-tight
                 text-neutral-600 ${compact ? "inset-x-0.5 px-0.5 py-0.5 text-center text-[9px]" : "inset-x-1 px-2 py-1 text-left text-xs"}`}
      style={{
        top,
        height,
        backgroundColor: "rgba(115, 115, 115, 0.12)",
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(115,115,115,0.18) 0, rgba(115,115,115,0.18) 1px, transparent 1px, transparent 8px)",
      }}
    >
      <p className="wrap-break-word font-semibold">{label}</p>
      {!compact && (
        <p className="tabular-nums opacity-80">
          {formatClock(startTime)}–{formatClock(endTime)}
        </p>
      )}
    </div>
  );
}

export default BusyCalendarBlock;
