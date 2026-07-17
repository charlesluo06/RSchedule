import { DAY_END_MIN, DAY_START_MIN, SLIDER_STEP_MIN, formatClock, minutesToTimeString, timeStringToMinutes } from "../lib/time";

interface TimeRangeSliderProps {
  startTime: string; // "HH:MM"
  endTime: string;
  onChange: (startTime: string, endTime: string) => void;
}

// A dual-handle slider isn't a native HTML element — this fakes it by
// stacking two independent <input type="range"> elements on top of each
// other in the same track, then using CSS so only their thumbs (not the
// full track) can be clicked. Each one just controls one end of the range.
function TimeRangeSlider({ startTime, endTime, onChange }: TimeRangeSliderProps) {
  const startMin = timeStringToMinutes(startTime);
  const endMin = timeStringToMinutes(endTime);

  function handleStartChange(value: number) {
    // Never let the start handle cross past the end handle.
    const clamped = Math.min(value, endMin - SLIDER_STEP_MIN);
    onChange(minutesToTimeString(clamped), endTime);
  }

  function handleEndChange(value: number) {
    // Never let the end handle cross before the start handle.
    const clamped = Math.max(value, startMin + SLIDER_STEP_MIN);
    onChange(startTime, minutesToTimeString(clamped));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-primary-700">Preferred time range</span>
        <span className="text-sm text-neutral-700 tabular-nums">
          {formatClock(startTime)} – {formatClock(endTime)}
        </span>
      </div>

      <div className="relative h-6 flex items-center">
        {/* Static track background */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-neutral-200" />
        {/* Highlighted segment between the two handles */}
        <div
          className="absolute h-1.5 rounded-full bg-primary-500"
          style={{
            left: `${((startMin - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)) * 100}%`,
            right: `${100 - ((endMin - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)) * 100}%`,
          }}
        />
        <input
          type="range"
          min={DAY_START_MIN}
          max={DAY_END_MIN}
          step={SLIDER_STEP_MIN}
          value={startMin}
          onChange={(e) => handleStartChange(Number(e.target.value))}
          className="range-thumb absolute inset-x-0 w-full appearance-none bg-transparent"
          aria-label="Earliest preferred start time"
        />
        <input
          type="range"
          min={DAY_START_MIN}
          max={DAY_END_MIN}
          step={SLIDER_STEP_MIN}
          value={endMin}
          onChange={(e) => handleEndChange(Number(e.target.value))}
          className="range-thumb absolute inset-x-0 w-full appearance-none bg-transparent"
          aria-label="Latest preferred end time"
        />
      </div>
    </div>
  );
}

export default TimeRangeSlider;
