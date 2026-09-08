import type { DayOfWeek } from "../types";
import { DAY_ORDER } from "../lib/time";

interface DayToggleRowProps {
  value: DayOfWeek[];
  onChange: (days: DayOfWeek[]) => void;
}

// The first multi-day-select control in the app — everywhere else (the
// calendar grid, Meeting.day) models recurrence as N single-day records,
// never a day set, so there was no existing pattern to reuse here. Styled
// as a segmented button row for visual consistency with the rest of the form.
function DayToggleRow({ value, onChange }: DayToggleRowProps) {
  function toggle(day: DayOfWeek) {
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day]);
  }

  return (
    <div className="flex gap-1.5">
      {DAY_ORDER.map((day) => (
        <button
          key={day}
          type="button"
          aria-pressed={value.includes(day)}
          onClick={() => toggle(day)}
          className={`flex-1 cursor-pointer rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors ${
            value.includes(day)
              ? "border-primary-500 bg-primary-500 text-white"
              : "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          {day}
        </button>
      ))}
    </div>
  );
}

export default DayToggleRow;
