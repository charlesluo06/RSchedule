import type { BusyBlock, Preferences } from "../types";
import TimeRangeSlider from "./TimeRangeSlider";
import BusyBlocksEditor from "./BusyBlocksEditor";

interface PreferencesBarProps {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
  busyBlocks: BusyBlock[];
  onBusyBlocksChange: (blocks: BusyBlock[]) => void;
}

// Two distinct panels — "how do you want your schedule shaped" (left: time
// range) vs. "what must your schedule avoid" (right: busy times, its own
// panel) — kept as separate panels even after GapControl was removed from
// the left one, since busy times gives real, precise control over what a
// schedule can't do, which is what GapControl's minimize/spread toggle was
// only ever a blunt substitute for. Reuses the exact same
// TimeRangeSlider/BusyBlocksEditor the setup card uses, but here every
// change immediately triggers a live re-generate (see App.tsx) — cheap to
// do repeatedly since it's calling /generate, not /courses.
function PreferencesBar({ preferences, onChange, busyBlocks, onBusyBlocksChange }: PreferencesBarProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white/70">
      <div className="flex flex-col sm:flex-row">
        {/* justify-center so this panel's content stays vertically centered
            if the row grows taller — e.g. once Busy times wraps to a second
            line of chips, the time slider shouldn't stay pinned to the top
            of the now-taller row. Sized to 3/5 of the row — the time range
            slider needs more horizontal room to stay legible than the busy
            times panel, whose content is short pills/a button, not a wide
            control. */}
        <div className="flex flex-col justify-center gap-4 p-4 sm:basis-3/5">
          <TimeRangeSlider
            startTime={preferences.startTime}
            endTime={preferences.endTime}
            onChange={(startTime, endTime) => onChange({ ...preferences, startTime, endTime })}
          />
        </div>
        {/* A plain flex row (no items-start override) so this divider
            naturally stretches to match whichever panel ends up taller,
            instead of stopping short at one panel's own content height. */}
        <div className="border-t border-neutral-200 sm:border-t-0 sm:border-l" />
        <div className="p-4 sm:basis-2/5">
          <BusyBlocksEditor blocks={busyBlocks} onChange={onBusyBlocksChange} />
        </div>
      </div>
    </div>
  );
}

export default PreferencesBar;
