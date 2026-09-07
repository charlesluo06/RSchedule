import type { SerializedSchedule } from "../types";
import { totalUnits } from "../lib/time";

interface ScheduleStatsProps {
  schedule: SerializedSchedule;
}

// "Total gap" used to show here too, but the active tab right above already
// displays that exact same number ("Option 1 · 45m gap") — showing it twice
// in two rows of the same sticky bar was pure redundancy, not information.
// "Earliest class" is gone too — the calendar right below already shows that
// visually (it's just whichever block sits at the top of the grid).
function ScheduleStats({ schedule }: ScheduleStatsProps) {
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-3 text-sm sm:w-auto sm:justify-start">
      <span className="text-neutral-700">
        <span className="font-medium text-primary-700">Total units:</span>{" "}
        {totalUnits(schedule.selections)}
      </span>
      {!schedule.fitsTimeRange && (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
          Outside your preferred time range
        </span>
      )}
    </div>
  );
}

export default ScheduleStats;
