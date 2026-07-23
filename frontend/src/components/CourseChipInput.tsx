import { useEffect, useRef, useState } from "react";
import { getCourseCodesForSubject, getSubjects } from "../api";
import { normalizeCourseCode } from "../lib/normalize";
import type { CourseCodeOption, Subject } from "../types";

const MAX_SUGGESTIONS = 5;
const DEBOUNCE_MS = 200;

interface CourseChipInputProps {
  courseCodes: string[];
  termCode: string;
  onChange: (codes: string[]) => void;
}

function CourseChipInput({ courseCodes, termCode, onChange }: CourseChipInputProps) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<CourseCodeOption[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  // Only true while an actual network fetch is in flight (not during the
  // debounce wait itself, and not for the instant client-side-cached path) —
  // drives the shimmer bar under the input. Existing suggestions stay put
  // while this is true rather than being cleared out from under the user.
  const [isSearching, setIsSearching] = useState(false);

  // UCR does an EXACT match on subject code (txt_subject=PS returns nothing
  // even though PSYC exists) — so typed letters can't be assumed to *be* a
  // subject. Instead we fetch the full subject list once per term, then match
  // typed letters as a *prefix* against it. That prefix can match zero, one,
  // or several real subjects (e.g. "MA" matches MATH, plus any other subject
  // starting with those letters) — every match gets its course list fetched.
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Per-subject cache, keyed by "SUBJECT:termCode" — once we've fetched a
  // subject's full course list, every further keystroke within that subject
  // is just filtering this array, no more network calls. A ref (not state)
  // because updating it should never itself trigger a re-render.
  const courseCodeCache = useRef<Map<string, CourseCodeOption[]>>(new Map());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!termCode) {
      setSubjects([]);
      return;
    }
    let cancelled = false;
    getSubjects(termCode)
      .then((list) => {
        if (!cancelled) setSubjects(list);
      })
      .catch(() => {
        if (!cancelled) setSubjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [termCode]);

  useEffect(() => {
    // Clear any pending fetch if the component unmounts mid-debounce.
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  function applySuggestions(list: CourseCodeOption[], normalizedDraft: string) {
    const filtered = list
      .filter((option) => option.code.startsWith(normalizedDraft))
      .slice(0, MAX_SUGGESTIONS);
    setSuggestions(filtered);
    setSuggestionsOpen(filtered.length > 0);
    setHighlightedIndex(0);
  }

  async function loadCourseCodes(subjectCode: string): Promise<CourseCodeOption[]> {
    const cacheKey = `${subjectCode}:${termCode}`;
    const cached = courseCodeCache.current.get(cacheKey);
    if (cached) return cached;
    const codes = await getCourseCodesForSubject(subjectCode, termCode);
    courseCodeCache.current.set(cacheKey, codes);
    return codes;
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const normalized = normalizeCourseCode(value);
    const prefix = normalized.match(/^[A-Za-z]+/)?.[0] ?? "";
    if (prefix.length < 2 || !termCode || subjects.length === 0) {
      setSuggestionsOpen(false);
      return;
    }

    const matchingSubjects = subjects.filter((s) => s.code.startsWith(prefix));
    if (matchingSubjects.length === 0) {
      setSuggestionsOpen(false);
      return;
    }

    // If every matching subject's course list is already cached, apply
    // instantly with no debounce delay — matches the snappy feel of pure
    // client-side filtering once a subject has been fetched before.
    const allCached = matchingSubjects.every((s) => courseCodeCache.current.has(`${s.code}:${termCode}`));
    if (allCached) {
      const merged = matchingSubjects.flatMap((s) => courseCodeCache.current.get(`${s.code}:${termCode}`)!);
      applySuggestions(merged, normalized);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await Promise.all(matchingSubjects.map((s) => loadCourseCodes(s.code)));
        applySuggestions(results.flat(), normalized);
      } catch {
        // Autocomplete failing silently is fine — typing a code manually
        // and pressing Enter still works as a fallback.
        setSuggestionsOpen(false);
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);
  }

  function addCourse(code: string) {
    const normalized = normalizeCourseCode(code);
    if (normalized && !courseCodes.includes(normalized)) {
      onChange([...courseCodes, normalized]);
    }
    setDraft("");
    setSuggestionsOpen(false);
  }

  function removeCourse(code: string) {
    onChange(courseCodes.filter((c) => c !== code));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestionsOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Escape") {
        setSuggestionsOpen(false);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        addCourse(suggestions[highlightedIndex].code);
        return;
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      addCourse(draft);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-primary-700">Courses</span>

      {courseCodes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {courseCodes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1
                         text-sm font-medium text-primary-700"
            >
              {code}
              <button
                type="button"
                onClick={() => removeCourse(code)}
                aria-label={`Remove ${code}`}
                className="cursor-pointer text-primary-500 hover:text-primary-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setSuggestionsOpen(false)}
          placeholder="e.g. MATH010A"
          role="combobox"
          aria-expanded={suggestionsOpen}
          aria-autocomplete="list"
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-neutral-900
                     placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        {/* Shimmer bar — only while an actual network fetch is in flight
            (not the debounce wait, not the instant cached path). Overlaps
            the input's own bottom edge so it never shifts the dropdown's
            position below it. */}
        {isSearching && (
          <div className="absolute inset-x-0 -bottom-1 h-1 overflow-hidden rounded-full bg-neutral-200">
            <div className="shimmer-sweep h-full w-1/2 rounded-full bg-primary-500" />
          </div>
        )}

        {suggestionsOpen && (
          <ul className="absolute z-10 mt-1 w-full rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
            {suggestions.map((option, index) => (
              <li key={option.code}>
                <button
                  type="button"
                  // onMouseDown (not onClick) fires before the input's onBlur
                  // closes the dropdown — onClick would arrive too late.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addCourse(option.code);
                  }}
                  className={`flex w-full cursor-pointer flex-col px-3 py-1.5 text-left ${
                    index === highlightedIndex ? "bg-primary-50" : "hover:bg-neutral-50"
                  }`}
                >
                  <span className="text-sm font-medium text-neutral-900">{option.code}</span>
                  <span className="truncate text-xs text-neutral-500">{option.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default CourseChipInput;
