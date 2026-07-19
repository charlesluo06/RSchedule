import type { Preferences } from "../types";
import TimeRangeSlider from "./TimeRangeSlider";
import GapControl from "./GapControl";

interface PreferencesBarProps {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
}

// Reuses the exact same TimeRangeSlider/GapControl the setup card uses, but
// here every change immediately triggers a live re-generate (see App.tsx) —
// cheap to do repeatedly since it's calling /generate, not /courses.
function PreferencesBar({ preferences, onChange }: PreferencesBarProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white/70 p-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-6">
      <div className="w-full min-w-0 flex-1 sm:w-auto sm:min-w-64">
        <TimeRangeSlider
          startTime={preferences.startTime}
          endTime={preferences.endTime}
          onChange={(startTime, endTime) => onChange({ ...preferences, startTime, endTime })}
        />
      </div>
      <GapControl
        value={preferences.gapPreference}
        onChange={(gapPreference) => onChange({ ...preferences, gapPreference })}
      />
    </div>
  );
}

export default PreferencesBar;
