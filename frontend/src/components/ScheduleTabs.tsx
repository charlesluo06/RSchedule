import type { SerializedSchedule } from "../types";
import { formatDuration } from "../lib/time";

interface ScheduleTabsProps {
  schedules: SerializedSchedule[];
  activeTab: number;
  onChange: (index: number) => void;
}

function ScheduleTabs({ schedules, activeTab, onChange }: ScheduleTabsProps) {
  return (
    <div className="flex gap-2">
      {schedules.map((schedule, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onChange(index)}
          className={`flex flex-1 cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors ${
            index === activeTab
              ? "border-accent-500 bg-accent-500/10"
              : "border-neutral-200 bg-white hover:bg-neutral-50"
          }`}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Option {index + 1}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-neutral-700 tabular-nums">
            {formatDuration(schedule.gapMinutes)} gap
            {schedule.fitsTimeRange && (
              <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                Fits window
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export default ScheduleTabs;
