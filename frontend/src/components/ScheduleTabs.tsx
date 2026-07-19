import { useEffect, useRef, useState } from "react";
import type { SerializedSchedule } from "../types";
import { formatDuration } from "../lib/time";

interface ScheduleTabsProps {
  schedules: SerializedSchedule[];
  activeTab: number;
  onChange: (index: number) => void;
}

function ScheduleTabs({ schedules, activeTab, onChange }: ScheduleTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Native scrollbars — especially iOS Safari's — are OS-controlled overlay
  // indicators that only ever appear during an active scroll gesture; no
  // amount of CSS can force them to stay visible at rest. So instead of
  // relying on the real scrollbar (hidden via `no-native-scrollbar` below),
  // this tracks the real scroll position and renders its own track + thumb
  // that's always in the DOM, regardless of platform or scroll state.
  const [thumb, setThumb] = useState({ widthPct: 100, leftPct: 0 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function updateThumb() {
      if (!el) return;
      const { scrollWidth, clientWidth, scrollLeft } = el;
      const widthPct = Math.min(100, (clientWidth / scrollWidth) * 100);
      const maxScroll = scrollWidth - clientWidth;
      const leftPct = maxScroll > 0 ? (scrollLeft / maxScroll) * (100 - widthPct) : 0;
      setThumb({ widthPct, leftPct });
    }

    updateThumb();
    el.addEventListener("scroll", updateThumb);
    window.addEventListener("resize", updateThumb);
    return () => {
      el.removeEventListener("scroll", updateThumb);
      window.removeEventListener("resize", updateThumb);
    };
  }, [schedules.length]);

  // The right-edge fade implies "more to scroll to" — it should disappear
  // once there's genuinely nothing left to reveal, i.e. scrolled to the end.
  const isAtEnd = thumb.leftPct + thumb.widthPct >= 99.5;

  return (
    <div>
      {/* Below sm, 3 tabs (each with a duration + "Fits window" pill) don't
          fit the viewport width and were running off the page — scroll this
          row horizontally on mobile instead; overflow-y is pinned to hidden
          (not "visible", which CSS silently upgrades to "auto" whenever the
          other axis isn't visible) so this doesn't turn into a second
          vertically-scrollable region fighting the page's own scroll. */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="no-native-scrollbar flex gap-2 overflow-x-auto overflow-y-hidden sm:overflow-visible"
        >
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

        {/* Edge fade hinting that this row scrolls — mobile only (desktop
            never scrolls here, tabs share the row via sm:flex-1 instead).
            bg-linear-to-l -> transparent so it blends into whatever's behind
            it (the sticky bar's white background) rather than a hard edge.
            Hidden once scrolled to the end — there's nothing left to hint at. */}
        {!isAtEnd && (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-white to-transparent sm:hidden"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Custom always-visible scroll indicator — mobile only (desktop
          never scrolls here, tabs share the row via sm:flex-1 instead). */}
      <div className="mt-1.5 h-1 w-full rounded-full bg-neutral-200 sm:hidden">
        <div
          className="h-full rounded-full bg-neutral-400 transition-[left,width]"
          style={{ width: `${thumb.widthPct}%`, marginLeft: `${thumb.leftPct}%` }}
        />
      </div>
    </div>
  );
}

export default ScheduleTabs;
