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
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white/70">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-6">
        <div className="w-full min-w-0 flex-1 sm:w-auto sm:min-w-64">
          <TimeRangeSlider
            startTime={preferences.startTime}
            endTime={preferences.endTime}
            onChange={(startTime, endTime) => onChange({ ...preferences, startTime, endTime })}
          />
        </div>
        {/* A hairline divider only shows up once the two controls sit side
            by side (sm+) — on the stacked mobile layout there's no shared
            edge for it to visually separate. */}
        <div className="hidden self-stretch border-l border-neutral-200 sm:block" />
        <GapControl
          value={preferences.gapPreference}
          onChange={(gapPreference) => onChange({ ...preferences, gapPreference })}
        />
      </div>
    </div>
  );
}

export default PreferencesBar;
