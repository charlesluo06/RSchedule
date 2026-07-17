import type { SerializedSchedule } from "../types";
import { earliestStartLabel, formatDuration } from "../lib/time";

interface ScheduleStatsProps {
  schedule: SerializedSchedule;
}

function ScheduleStats({ schedule }: ScheduleStatsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-neutral-700">
        <span className="font-medium text-primary-700">Total gap:</span>{" "}
        {formatDuration(schedule.gapMinutes)}
      </span>
      <span className="text-neutral-300">·</span>
      <span className="text-neutral-700">
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
