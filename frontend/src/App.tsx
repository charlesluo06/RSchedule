import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { getTerms, postCourses, postGenerate } from "./api";
import type { Bundle, BusyBlock, GenerateResponse, Preferences, Term } from "./types";
import TermDropdown from "./components/TermDropdown";
import CourseChipInput from "./components/CourseChipInput";
import TimeRangeSlider from "./components/TimeRangeSlider";
import BusyBlocksEditor from "./components/BusyBlocksEditor";
import CalendarGrid from "./components/CalendarGrid";
import ScheduleTabs from "./components/ScheduleTabs";
import ScheduleStats from "./components/ScheduleStats";
import PreferencesBar from "./components/PreferencesBar";
import MessageBanner from "./components/MessageBanner";
import UnschedulableBadges from "./components/UnschedulableBadges";
import BootScreen from "./components/BootScreen";
import LegalModal from "./components/LegalModal";
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
                // Toned down from the real calendar block's full-strength
                // solid color (opacity, not the shared palette value) —
                // this sits on the landing page next to the gold/navy
                // brand chrome, where full vibrancy competes with it. The
                // real calendar block elsewhere stays untouched.
                <div
                  key={j}
                  className="h-9 rounded-md opacity-60"
                  style={{ backgroundColor: courseColorForIndex(colorIndex).solid }}
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
  });
  // Held so preference changes on the results view can re-call postGenerate
  // without re-fetching from UCR — only re-fetched when courses/term change.
  // Kept separate from `preferences` (which mirrors the backend's
  // TimeRangePreference contract exactly) rather than merged in — merging
  // would ripple into PreferencesBar's and CalendarGrid's existing
  // `preferences` prop contracts for no real benefit.
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>([]);
  const [courseBundles, setCourseBundles] = useState<Record<string, Bundle[]> | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [step, setStep] = useState<"setup" | "results">("setup");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  // Points at CalendarGrid's own root div (just the hour axis + day
  // columns, not ArrangedNote or the modal) — see handleDownloadSchedule.
  const calendarGridRef = useRef<HTMLDivElement>(null);
  const [downloadingSchedule, setDownloadingSchedule] = useState(false);

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
        // Term codes are "YYYY" + a 2-digit term indicator — 10/20/30/40 for
        // Winter/Spring/Summer/Fall (e.g. "202540" = Fall 2025) — so the full
        // numeric code already sorts in exact chronological order on its
        // own. UCR's raw response happens to come back newest-first today,
        // but nothing guarantees that stays true once a new term (e.g.
        // Winter 2027) gets added on their end — sorting explicitly here
        // means a newly-published term slots into the right place
        // automatically instead of silently depending on UCR's own order.
        // Older terms are still returned by UCR but aren't useful for
        // planning a future schedule, so the dropdown only lists 2026+ —
        // that list still legitimately includes past-but-recent terms like
        // Winter/Spring/Summer 2026 (marked "(View Only)" by UCR) once the
        // calendar catches up to them, which is fine to browse but wrong to
        // default to.
        const recentTerms = fetchedTerms
          .filter((term) => Number(term.code.slice(0, 4)) >= 2026)
          .sort((a, b) => Number(a.code) - Number(b.code));
        setTerms(recentTerms);
        // The default selection specifically needs the first CURRENT/FUTURE
        // term (not "(View Only)") — otherwise, once Winter/Spring/Summer
        // 2026 pass and start showing "(View Only)" themselves, the
        // earliest item in the whole list becomes one of those past terms
        // instead of the term actually open for planning (Fall 2026 today).
        const defaultTerm = recentTerms.find((term) => !term.description.includes("View Only"));
        setSelectedTermCode(defaultTerm?.code ?? recentTerms[0]?.code ?? "");
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
        return postGenerate(bundles, preferences, busyBlocks);
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
    postGenerate(courseBundles, newPreferences, busyBlocks)
      .then((result) => {
        setGenerateResult(result);
        setActiveTab(0);
      })
      .catch((err: Error) => setGenerateError(err.message))
      .finally(() => setGenerateLoading(false));
  }

  // Called from the results view's BusyBlocksEditor (now mounted inside
  // PreferencesBar, same as the time-range/gap controls). Same shape as
  // handlePreferencesChangeOnResults — reuses the already-fetched
  // courseBundles and only re-calls /generate, never /courses.
  function handleBusyBlocksChangeOnResults(newBusyBlocks: BusyBlock[]) {
    setBusyBlocks(newBusyBlocks);
    if (!courseBundles) return;

    setGenerateLoading(true);
    setGenerateError(null);
    postGenerate(courseBundles, preferences, newBusyBlocks)
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
        return postGenerate(bundles, preferences, busyBlocks);
      })
      .then((result) => {
        setGenerateResult(result);
        setActiveTab(0);
      })
      .catch((err: Error) => setGenerateError(err.message))
      .finally(() => setGenerateLoading(false));
  }

  // Renders just CalendarGrid's own root div (hour axis + day columns — see
  // the gridRef prop) to a PNG and triggers a browser download. Only ever
  // captures the currently active tab, matching what's actually on screen
  // when the button is clicked — switching tabs first downloads that one.
  async function handleDownloadSchedule() {
    if (!calendarGridRef.current) return;
    setDownloadingSchedule(true);
    try {
      // pixelRatio 1.5 — sharper than 1x without paying full retina (2x)
      // cost; each step down in ratio is a quadratic drop in pixels
      // actually rasterized. backgroundColor is explicit because the grid
      // itself has no opaque background in the live page otherwise (it
      // sits on the results card's translucent background). skipFonts
      // avoids html-to-image's default behavior of re-fetching and
      // base64-inlining every @font-face resource (Inter ships several
      // weights × formats) purely to make the output self-contained — the
      // font is already loaded and applied on the live page, so skipping
      // that step doesn't change how the text actually renders, it just
      // cuts out a slow, unnecessary round-trip before capturing.
      const dataUrl = await toPng(calendarGridRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 1.5,
        skipFonts: true,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `rschedule-option-${activeTab + 1}.png`;
      link.click();
    } catch (err) {
      console.error("Failed to generate schedule image:", err);
      setGenerateError("Couldn't generate the schedule image. Please try again.");
    } finally {
      setDownloadingSchedule(false);
    }
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
      {/* Purely decorative — a faint dot grid, so the empty space around
          the page content reads as intentional atmosphere instead of
          unfinished emptiness. Shared by both setup and results screens.
          (The blue/gold corner blobs that used to sit here got removed —
          one too many decorative layers stacked at once.) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
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
          <div className="animate-fade-in relative -mt-8 flex w-full max-w-5xl flex-col items-center sm:mt-0 lg:flex-row lg:items-center lg:gap-16">
            <div className="flex w-full max-w-md flex-col items-center gap-6 text-center lg:flex-1 lg:items-start lg:text-left">
              <div className="w-full">
                <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">
                  <span className="text-accent-500">R</span>
                  <span className="text-primary-700">Schedule</span>
                </h1>
                <p className="mt-3 text-lg text-neutral-600">
                  Build a conflict-free UCR schedule in seconds.
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
            <BusyBlocksEditor blocks={busyBlocks} onChange={setBusyBlocks} />
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

          <button
            type="button"
            onClick={() => setLegalModalOpen(true)}
            className="absolute inset-x-0 bottom-4 flex cursor-pointer items-center justify-center gap-1
                       text-xs text-neutral-400 hover:text-neutral-600"
          >
            Not affiliated with or endorsed by UCR.
            <svg
              viewBox="0 0 20 20"
              className="h-3 w-3 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 9v4.5" strokeLinecap="round" />
              <circle cx="10" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
            </svg>
          </button>

          {legalModalOpen && <LegalModal onClose={() => setLegalModalOpen(false)} />}
        </>
      )}

      {step === "results" && generateResult && (
        <div
          className="animate-fade-in relative w-full max-w-5xl rounded-2xl border border-white/40 bg-white/60 p-4 shadow-lg
                     backdrop-blur-md ring-1 ring-black/5 sm:p-6"
        >
          <div className="mb-4 flex flex-col gap-3">
            {/* RSchedule + Edit courses always share one row (justify-between
                naturally puts them at opposite ends, mobile or desktop) —
                this used to be nested inside the same wrapping group as
                Refresh/Download below, which is why it drifted onto its own
                line on narrow screens. */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep("setup")}
                className="cursor-pointer text-2xl font-semibold tracking-tight opacity-100 transition-opacity hover:opacity-70"
              >
                <span className="text-accent-500">R</span>
                <span className="text-primary-700">Schedule</span>
              </button>
              <button
                type="button"
                onClick={() => setStep("setup")}
                className="cursor-pointer text-sm font-medium text-primary-700 hover:underline"
              >
                ← Edit courses
              </button>
            </div>
            {/* Refresh seats + Schedule (download), on their own row, mobile
                only — desktop shows this same pair together in the sticky
                ScheduleStats bar instead (see the sm:flex group below). */}
            <div className="flex items-center gap-3 sm:hidden">
              <button
                type="button"
                onClick={handleRefreshSeats}
                disabled={generateLoading}
                className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium
                           text-neutral-700 transition-colors hover:bg-neutral-100
                           disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generateLoading ? "Refreshing…" : "↻ Refresh seats"}
              </button>
              {showCalendar && activeSchedule && (
                <button
                  type="button"
                  onClick={handleDownloadSchedule}
                  disabled={downloadingSchedule}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300
                             px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100
                             disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <img src="/download.svg" alt="" className="h-4 w-4" />
                  {downloadingSchedule ? "Downloading…" : "Schedule"}
                </button>
              )}
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
          <PreferencesBar
            preferences={preferences}
            onChange={handlePreferencesChangeOnResults}
            busyBlocks={busyBlocks}
            onBusyBlocksChange={handleBusyBlocksChangeOnResults}
          />

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
                  {/* Total units now lives on the left, in ScheduleStats,
                      for both breakpoints — no more mobile/desktop split
                      showing it in two different physical spots. This
                      right-hand group is Refresh/Download now. */}
                  <ScheduleStats schedule={activeSchedule} />
                  <div className="hidden shrink-0 items-center gap-4 sm:flex">
                    <button
                      type="button"
                      onClick={handleDownloadSchedule}
                      disabled={downloadingSchedule}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300
                                 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100
                                 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <img src="/download.svg" alt="" className="h-4 w-4" />
                      {downloadingSchedule ? "Downloading…" : "Schedule"}
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshSeats}
                      disabled={generateLoading}
                      className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium
                                 text-neutral-700 transition-colors hover:bg-neutral-100
                                 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generateLoading ? "Refreshing…" : "↻ Refresh seats"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <CalendarGrid
                  selections={activeSchedule.selections}
                  preferences={preferences}
                  termCode={selectedTermCode}
                  busyBlocks={busyBlocks}
                  gridRef={calendarGridRef}
                />
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
