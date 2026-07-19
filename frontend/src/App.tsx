import { useEffect, useState } from "react";
import { getTerms, postCourses, postGenerate } from "./api";
import type { Bundle, GenerateResponse, Preferences, Term } from "./types";
import TermDropdown from "./components/TermDropdown";
import CourseChipInput from "./components/CourseChipInput";
import TimeRangeSlider from "./components/TimeRangeSlider";
import GapControl from "./components/GapControl";
import CalendarGrid from "./components/CalendarGrid";
import ScheduleTabs from "./components/ScheduleTabs";
import ScheduleStats from "./components/ScheduleStats";
import PreferencesBar from "./components/PreferencesBar";
import MessageBanner from "./components/MessageBanner";
import UnschedulableBadges from "./components/UnschedulableBadges";
import BootScreen from "./components/BootScreen";
import { courseColorForIndex } from "./lib/colors";

const PITCH_FEATURES = [
  "Live seat counts pulled straight from UCR",
  "Zero overlapping classes, guaranteed",
  "Ranked by fewest gaps between classes",
];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 text-primary-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M6.5 10l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A hand-placed decorative preview of what a generated schedule looks like —
// purely illustrative (no real data), just to give the empty space next to
// the setup card some visual product context instead of being blank.
function MiniCalendarPreview() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const blocksByDay: (number | null)[][] = [[0, 2], [null, 1], [0, null], [null, 1], [2, null]];
  return (
    <div className="hidden rounded-2xl border border-neutral-200 bg-white/70 p-4 shadow-sm lg:block">
      <div className="grid grid-cols-5 gap-2">
        {days.map((day, i) => (
          <div key={day} className="flex flex-col gap-1.5">
            <span className="text-center text-[10px] font-medium text-neutral-400">{day}</span>
            {blocksByDay[i].map((colorIndex, j) =>
              colorIndex === null ? (
                <div key={j} className="h-6" />
              ) : (
                <div
                  key={j}
                  className="h-9 rounded-md"
                  style={{ backgroundColor: courseColorForIndex(colorIndex).bg }}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermCode, setSelectedTermCode] = useState("");
  const [termsLoading, setTermsLoading] = useState(true);
  const [termsError, setTermsError] = useState<string | null>(null);
  // A real /terms fetch can resolve in well under a second, which would cut
  // the boot animation off before it ever gets to play. This guarantees the
  // boot screen stays up for at least one full fill cycle regardless of how
  // fast the network actually is.
  const [bootMinTimeElapsed, setBootMinTimeElapsed] = useState(false);
  const [courseCodes, setCourseCodes] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    startTime: "08:00",
    endTime: "20:00",
    gapPreference: "minimize",
  });
  // Held so preference changes on the results view can re-call postGenerate
  // without re-fetching from UCR — only re-fetched when courses/term change.
  const [courseBundles, setCourseBundles] = useState<Record<string, Bundle[]> | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [step, setStep] = useState<"setup" | "results">("setup");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Matches the .animate-logo-fill CSS duration (0.7s) so the boot screen
  // never disappears mid-animation on a fast connection.
  useEffect(() => {
    const timer = setTimeout(() => setBootMinTimeElapsed(true), 600);
    return () => clearTimeout(timer);
  }, []);

  // Fetch the live term list once, when the app first loads.
  useEffect(() => {
    getTerms()
      .then((fetchedTerms) => {
        // Term codes are "YYYY" + a 2-digit term indicator (e.g. "202540" =
        // Fall 2025) — older terms are still returned by UCR but aren't
        // useful for planning a future schedule, so we only show 2026+.
        const recentTerms = fetchedTerms.filter((term) => Number(term.code.slice(0, 4)) >= 2026);
        setTerms(recentTerms);
        setSelectedTermCode(recentTerms[0]?.code ?? "");
      })
      .catch(() => setTermsError("Couldn't load terms from UCR. Is the backend running?"))
      .finally(() => setTermsLoading(false));
  }, []);

  // Runs the full pipeline from the setup card: fetch section data from
  // UCR (via our backend), then run the scheduler against it. Both calls
  // happen here because this is the first time we're generating for this
  // exact set of courses/term.
  function handleGenerate() {
    setGenerateLoading(true);
    setGenerateError(null);
    postCourses(courseCodes, selectedTermCode)
      .then((bundles) => {
        setCourseBundles(bundles);
        return postGenerate(bundles, preferences);
      })
      .then((result) => {
        setGenerateResult(result);
        setActiveTab(0); // a fresh result means the old tab index may no longer exist
        setStep("results");
      })
      .catch((err: Error) => setGenerateError(err.message))
      .finally(() => setGenerateLoading(false));
  }

  // Called from the results view's PreferencesBar. Deliberately skips
  // postCourses entirely — the already-fetched courseBundles are reused, so
  // tweaking the time range or gap preference never re-hits UCR.
  function handlePreferencesChangeOnResults(newPreferences: Preferences) {
    setPreferences(newPreferences);
    if (!courseBundles) return;

    setGenerateLoading(true);
    setGenerateError(null);
    postGenerate(courseBundles, newPreferences)
      .then((result) => {
        setGenerateResult(result);
        setActiveTab(0);
      })
      .catch((err: Error) => setGenerateError(err.message))
      .finally(() => setGenerateLoading(false));
  }

  // Called from the "Refresh seat counts" button on the results view. Bypasses
  // the seat cache entirely (forceRefresh) so a student watching seats open
  // up during registration rush hour gets truly live numbers, not whatever
  // was cached up to 3 minutes ago.
  function handleRefreshSeats() {
    setGenerateLoading(true);
    setGenerateError(null);
    postCourses(courseCodes, selectedTermCode, true)
      .then((bundles) => {
        setCourseBundles(bundles);
        return postGenerate(bundles, preferences);
      })
      .then((result) => {
        setGenerateResult(result);
        setActiveTab(0);
      })
      .catch((err: Error) => setGenerateError(err.message))
      .finally(() => setGenerateLoading(false));
  }

  const canGenerate = courseCodes.length > 0 && selectedTermCode !== "" && !generateLoading;
  const activeSchedule = generateResult?.schedules[activeTab];
  // If not a single returned schedule fits the preferred time window, treat
  // it the same as "no schedule found" — showing a calendar full of classes
  // outside the window the user actually asked for isn't a real answer.
  const anyFitsTimeRange = generateResult?.schedules.some((s) => s.fitsTimeRange) ?? false;
  const showCalendar = Boolean(activeSchedule) && anyFitsTimeRange;

  if (termsLoading || !bootMinTimeElapsed) {
    return <BootScreen />;
  }

  return (
    <div className="relative min-h-svh bg-linear-to-b from-neutral-50 to-neutral-100 flex flex-col items-center justify-center gap-6 p-4 sm:p-6">
      {/* Purely decorative — soft brand-color corner washes (feathered
          gradients, no hard shape edge) plus a faint dot grid, so the empty
          space around the page content reads as intentional atmosphere
          instead of unfinished emptiness or a shape that visually collides
          with whatever's sitting on top of it. Shared by both setup and
          results screens. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 0% 0%, rgba(0,61,165,0.24), transparent 40%), " +
              "radial-gradient(circle at 100% 100%, rgba(255,184,28,0.22), transparent 40%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: "radial-gradient(circle, #94a3b8 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {step === "setup" && (
        <>
          <div className="animate-fade-in relative flex w-full max-w-5xl flex-col items-center gap-2 lg:flex-row lg:items-center lg:gap-16">
            <div className="flex w-full max-w-md flex-col items-center gap-6 text-center lg:flex-1 lg:items-start lg:text-left">
              <div className="w-full">
                <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">
                  <span className="text-accent-500">R</span>
                  <span className="text-primary-700">Schedule</span>
                </h1>
                <p className="mt-3 text-lg text-neutral-600">
                  Build a conflict-free UCR schedule in seconds — pick your courses, we handle the rest.
                </p>
              </div>

              {/* Hidden below lg — on mobile the title + tagline already
                  set the stage, and the form is the next thing that
                  actually matters; the bullet list is a nice-to-have that
                  was just adding scroll before getting to the form. */}
              <ul className="hidden flex-col items-center gap-2.5 lg:flex lg:items-start">
                {PITCH_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm font-medium text-neutral-700">
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-6 w-full">
                <MiniCalendarPreview />
              </div>
            </div>

          <div className="w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-white/40 bg-white/60 shadow-lg backdrop-blur-md ring-1 ring-black/5">
          <div className="h-1.5 w-full bg-linear-to-r from-accent-400 via-accent-500 to-accent-600" />
          <div className="p-6">
          <div className="mt-0">
            <TermDropdown
              terms={terms}
              selectedTermCode={selectedTermCode}
              onChange={setSelectedTermCode}
              loading={termsLoading}
              error={termsError}
            />
          </div>

          <div className="mt-4">
            <CourseChipInput courseCodes={courseCodes} termCode={selectedTermCode} onChange={setCourseCodes} />
          </div>

          <div className="mt-5">
            <TimeRangeSlider
              startTime={preferences.startTime}
              endTime={preferences.endTime}
              onChange={(startTime, endTime) =>
                setPreferences((prev) => ({ ...prev, startTime, endTime }))
              }
            />
          </div>

          <div className="mt-5">
            <GapControl
              value={preferences.gapPreference}
              onChange={(gapPreference) => setPreferences((prev) => ({ ...prev, gapPreference }))}
            />
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="mt-10 w-full cursor-pointer rounded-xl bg-accent-500 px-4 py-2.5 font-semibold text-primary-900
                       transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generateLoading ? "Generating…" : "Generate"}
          </button>

          {generateError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {generateError}
            </div>
          )}
          </div>
          </div>
          </div>
        </>
      )}

      {step === "results" && generateResult && (
        <div
          className="animate-fade-in relative w-full max-w-5xl rounded-2xl border border-white/40 bg-white/60 p-4 shadow-lg
                     backdrop-blur-md ring-1 ring-black/5 sm:p-6"
        >
          <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setStep("setup")}
              className="cursor-pointer text-2xl font-semibold tracking-tight opacity-100 transition-opacity hover:opacity-70"
            >
              <span className="text-accent-500">R</span>
              <span className="text-primary-700">Schedule</span>
            </button>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* On desktop this moves down to share a row with "Total gap"
                  instead — see the sm:hidden/hidden-sm:inline-flex pairing
                  below with ScheduleStats. */}
              <button
                type="button"
                onClick={handleRefreshSeats}
                disabled={generateLoading}
                className="cursor-pointer text-sm font-medium text-primary-700 hover:underline
                           disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
              >
                {generateLoading ? "Refreshing…" : "↻ Refresh seat counts"}
              </button>
              <button
                type="button"
                onClick={() => setStep("setup")}
                className="cursor-pointer text-sm font-medium text-primary-700 hover:underline"
              >
                ← Edit courses
              </button>
            </div>
          </div>

          {generateError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {generateError}
            </div>
          )}

          <div className="mb-4 flex flex-col gap-3">
            <MessageBanner message={generateResult.message} />
            <UnschedulableBadges courses={generateResult.unschedulableCourses} />
          </div>

          {/* Scrolls away with the page — only the option tabs below need to
              stay put once you're deep into the calendar. */}
          <PreferencesBar preferences={preferences} onChange={handlePreferencesChangeOnResults} />

          {showCalendar && activeSchedule && (
            <>
              {/* Sticky so switching options or checking stats is still
                  possible without scrolling back up past the calendar.
                  Fully opaque (not translucent like the card) and extended
                  edge-to-edge via negative margin — a stuck header shouldn't
                  look like a floating rounded card with content ghosting
                  through it; a solid bar with a clean bottom border reads
                  as "pinned" instead of "awkwardly overlapping." */}
              <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-neutral-200 bg-white px-4 py-3 shadow-sm sm:-mx-6 sm:px-6">
                <ScheduleTabs
                  schedules={generateResult.schedules}
                  activeTab={activeTab}
                  onChange={setActiveTab}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <ScheduleStats schedule={activeSchedule} />
                  {/* Desktop-only placement, sharing a row with "Total gap"
                      instead of sitting up in the title row (see the mobile
                      version, hidden here via sm:hidden, up in the header). */}
                  <button
                    type="button"
                    onClick={handleRefreshSeats}
                    disabled={generateLoading}
                    className="hidden shrink-0 cursor-pointer text-sm font-medium text-primary-700 hover:underline
                               disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
                  >
                    {generateLoading ? "Refreshing…" : "↻ Refresh seat counts"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <CalendarGrid selections={activeSchedule.selections} preferences={preferences} />
              </div>
            </>
          )}

          {!(showCalendar && activeSchedule) && (
            <p className="mt-6 text-center text-sm text-neutral-500">
              No schedule could be generated — see the details above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
