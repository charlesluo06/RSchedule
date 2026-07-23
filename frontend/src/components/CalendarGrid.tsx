import { useEffect, useState } from "react";
import type { Bundle, Preferences, Section } from "../types";
import { courseColorForIndex, type CourseColor } from "../lib/colors";
import { DAY_ORDER, HOUR_PX, MOBILE_HOUR_PX, computeVisibleWindow, timeStringToMinutes } from "../lib/time";
import CalendarBlock from "./CalendarBlock";
import ArrangedNote from "./ArrangedNote";
import ClassDetailModal from "./ClassDetailModal";

// Matches Tailwind's `sm` breakpoint (640px) — below it, rows switch to the
// taller MOBILE_HOUR_PX so blocks have room to breathe on a phone screen.
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);
  return isMobile;
}

interface CalendarGridProps {
  selections: Record<string, Bundle>;
  preferences: Preferences;
}

interface SelectedSection {
  courseCode: string;
  section: Section;
  color: CourseColor;
  bundleCredits: number;
}

function CalendarGrid({ selections, preferences }: CalendarGridProps) {
  const [selectedSection, setSelectedSection] = useState<SelectedSection | null>(null);
  const isMobile = useIsMobile();
  const hourPx = isMobile ? MOBILE_HOUR_PX : HOUR_PX;

  // Sorting course codes first (rather than using object key order, which
  // isn't guaranteed) means a course keeps the same color every time this
  // grid re-renders, even across different tabs/schedules.
  const sortedCourseCodes = Object.keys(selections).sort();

  // Only show the hours actually relevant to this schedule/preference,
  // instead of always rendering the full 7am-10pm slider range.
  const { startMin, endMin } = computeVisibleWindow(preferences.startTime, preferences.endTime, selections);
  const startHour = startMin / 60;
  const totalHeight = ((endMin - startMin) / 60) * hourPx;
  const hours = Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => startHour + i);

  // A section with no meetings has no day or time to be positioned by, so it
  // can never appear as a block — collected here in one clean pass, separate
  // from the actual grid rendering below.
  const arrangedSections = sortedCourseCodes.flatMap((courseCode) =>
    selections[courseCode].sections
      .filter((section) => section.meetings.length === 0)
      .map((section) => ({ courseCode, sectionType: section.sectionType, crn: section.crn })),
  );

  return (
    <div>
      {/* Mobile deliberately zooms OUT instead of scrolling horizontally —
          all 5 days stay visible at once (like Google Calendar's phone
          week view), with a much shorter hourPx and compact CalendarBlocks
          (title only) making that legible instead of scrolling sideways to
          read one day at a time. */}
      <div className="flex">
        {/* Hour-axis gutter */}
        <div className="relative w-8 shrink-0 sm:w-12" style={{ height: totalHeight }}>
          {hours.map((h) => (
            <span
              key={h}
              className="absolute right-1 -translate-y-1/2 text-xs text-neutral-500 tabular-nums"
              style={{ top: (h - startHour) * hourPx }}
            >
              {h <= 12 ? `${h}${h === 12 ? "pm" : "am"}` : `${h - 12}pm`}
            </span>
          ))}
        </div>

        {/* Day columns */}
        {DAY_ORDER.map((day) => (
          <div key={day} className="flex-1 border-l border-neutral-200">
            <p className="pb-1 text-center text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {day}
            </p>
            <div className="relative" style={{ height: totalHeight }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-neutral-100"
                  style={{ top: (h - startHour) * hourPx }}
                />
              ))}

              {sortedCourseCodes.map((courseCode, courseIndex) => {
                const bundle = selections[courseCode];
                const color = courseColorForIndex(courseIndex);
                const bundleCredits = bundle.sections.reduce((sum, s) => sum + s.creditHours, 0);

                return bundle.sections.flatMap((section) =>
                  section.meetings
                    .filter((meeting) => meeting.day === day)
                    .map((meeting) => {
                      const meetingStartMin = timeStringToMinutes(meeting.startTime) - startMin;
                      const meetingEndMin = timeStringToMinutes(meeting.endTime) - startMin;
                      return (
                        <CalendarBlock
                          key={`${section.crn}-${day}`}
                          top={(meetingStartMin / 60) * hourPx}
                          height={((meetingEndMin - meetingStartMin) / 60) * hourPx}
                          color={color}
                          courseCode={courseCode}
                          sectionType={section.sectionType}
                          crn={section.crn}
                          room={`${meeting.building} ${meeting.room}`}
                          startTime={meeting.startTime}
                          endTime={meeting.endTime}
                          seatsAvailable={section.seatsAvailable}
                          compact={isMobile}
                          onClick={() => setSelectedSection({ courseCode, section, color, bundleCredits })}
                        />
                      );
                    }),
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <ArrangedNote sections={arrangedSections} />

      {selectedSection && (
        <ClassDetailModal
          courseCode={selectedSection.courseCode}
          section={selectedSection.section}
          color={selectedSection.color}
          bundleCredits={selectedSection.bundleCredits}
          onClose={() => setSelectedSection(null)}
        />
      )}
    </div>
  );
}

export default CalendarGrid;
