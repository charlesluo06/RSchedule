import { useState } from "react";
import type { Bundle, Section } from "../types";
import { courseColorForIndex, type CourseColor } from "../lib/colors";
import { DAY_END_MIN, DAY_ORDER, DAY_START_MIN, HOUR_PX, timeStringToMinutes } from "../lib/time";
import CalendarBlock from "./CalendarBlock";
import ArrangedNote from "./ArrangedNote";
import ClassDetailModal from "./ClassDetailModal";

interface CalendarGridProps {
  selections: Record<string, Bundle>;
}

interface SelectedSection {
  courseCode: string;
  section: Section;
  color: CourseColor;
}

function CalendarGrid({ selections }: CalendarGridProps) {
  const [selectedSection, setSelectedSection] = useState<SelectedSection | null>(null);

  // Sorting course codes first (rather than using object key order, which
  // isn't guaranteed) means a course keeps the same color every time this
  // grid re-renders, even across different tabs/schedules.
  const sortedCourseCodes = Object.keys(selections).sort();

  const totalHeight = ((DAY_END_MIN - DAY_START_MIN) / 60) * HOUR_PX;
  const hours = Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }, (_, i) => 7 + i);

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
      <div className="flex">
        {/* Hour-axis gutter */}
        <div className="relative w-12 shrink-0" style={{ height: totalHeight }}>
          {hours.map((h) => (
            <span
              key={h}
              className="absolute right-1 -translate-y-1/2 text-xs text-neutral-500 tabular-nums"
              style={{ top: (h - 7) * HOUR_PX }}
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
                  style={{ top: (h - 7) * HOUR_PX }}
                />
              ))}

              {sortedCourseCodes.map((courseCode, courseIndex) => {
                const bundle = selections[courseCode];
                const color = courseColorForIndex(courseIndex);

                return bundle.sections.flatMap((section) =>
                  section.meetings
                    .filter((meeting) => meeting.day === day)
                    .map((meeting) => {
                      const startMin = timeStringToMinutes(meeting.startTime) - DAY_START_MIN;
                      const endMin = timeStringToMinutes(meeting.endTime) - DAY_START_MIN;
                      return (
                        <CalendarBlock
                          key={`${section.crn}-${day}`}
                          top={(startMin / 60) * HOUR_PX}
                          height={((endMin - startMin) / 60) * HOUR_PX}
                          color={color}
                          courseCode={courseCode}
                          sectionType={section.sectionType}
                          crn={section.crn}
                          room={`${meeting.building} ${meeting.room}`}
                          startTime={meeting.startTime}
                          endTime={meeting.endTime}
                          onClick={() => setSelectedSection({ courseCode, section, color })}
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
          onClose={() => setSelectedSection(null)}
        />
      )}
    </div>
  );
}

export default CalendarGrid;
