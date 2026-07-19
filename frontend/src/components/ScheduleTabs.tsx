import type { SerializedSchedule } from "../types";
import { formatDuration } from "../lib/time";

interface ScheduleTabsProps {
  schedules: SerializedSchedule[];
  activeTab: number;
  onChange: (index: number) => void;
}

function ScheduleTabs({ schedules, activeTab, onChange }: ScheduleTabsProps) {
  return (
    // Below sm, 3 tabs (each with a duration + "Fits window" pill) don't
    // fit the viewport width and were running off the page — scroll this
    // row horizontally on mobile instead; overflow-y is pinned to hidden
    // (not "visible", which CSS silently upgrades to "auto" whenever the
    // other axis isn't visible) so this doesn't turn into a second
    // vertically-scrollable region fighting the page's own scroll.
    <div className="flex gap-2 overflow-x-auto overflow-y-hidden sm:overflow-visible">
      {schedules.map((schedule, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onChange(index)}
          className={`flex shrink-0 min-w-32 cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors sm:min-w-0 sm:flex-1 ${
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
