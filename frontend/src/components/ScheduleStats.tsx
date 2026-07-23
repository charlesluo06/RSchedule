import type { SerializedSchedule } from "../types";
import { earliestStartLabel, formatDuration, totalUnits } from "../lib/time";

interface ScheduleStatsProps {
  schedule: SerializedSchedule;
}

function ScheduleStats({ schedule }: ScheduleStatsProps) {
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-3 text-sm sm:w-auto sm:justify-start">
      {/* Total units moves up to the header on desktop instead (see
          App.tsx) — mobile has no room up there, so it stays down here. */}
      <span className="text-neutral-700 sm:hidden">
        <span className="font-medium text-primary-700">Total units:</span>{" "}
        {totalUnits(schedule.selections)}
      </span>
      <span className="text-neutral-300 sm:hidden">·</span>
      <span className="text-neutral-700">
        <span className="font-medium text-primary-700">Total gap:</span>{" "}
        {formatDuration(schedule.gapMinutes)}
      </span>
      {/* Earliest class is desktop-only — dropped on mobile to keep this
          row from getting too crowded. */}
      <span className="hidden text-neutral-300 sm:inline">·</span>
      <span className="hidden text-neutral-700 sm:inline">
        <span className="font-medium text-primary-700">Earliest class:</span>{" "}
        {earliestStartLabel(schedule.selections)}
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
