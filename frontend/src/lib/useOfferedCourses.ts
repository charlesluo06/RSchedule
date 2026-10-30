import { useEffect, useRef, useState } from "react";
import { getCourseCodesForSubject } from "../api";
import type { CourseCodeOption } from "../types";
import type { AuditData } from "./auditParser";

// How many subject lookups run at once. The backend serializes UCR searches
// anyway and caches course lists for a day, so this just keeps a cold first
// import from opening a dozen requests in one burst.
const CONCURRENCY = 4;

export type OptionLookup =
  | { status: "loading" }
  // The subject's course list couldn't be fetched, so we can't say either way.
  | { status: "unknown" }
  // Courses matching this option that are offered in the term (empty = none).
  | { status: "ok"; courses: CourseCodeOption[] };

export function subjectOf(code: string): string {
  return code.match(/^[A-Z]+/)?.[0] ?? "";
}

// Works out which of the audit's needed courses are actually offered in the
// selected term by reusing the same per-subject course lists the course input
// autocompletes from. Wildcards ("CS179@") expand to every matching offered
// course ("CS179A", ...).
export function useOfferedCourses(audit: AuditData | null, termCode: string) {
  // Keyed "SUBJECT:term"; null marks a failed lookup.
  const [lists, setLists] = useState<Map<string, CourseCodeOption[] | null>>(new Map());
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (!audit || !termCode) return;
    const subjects = new Set(audit.needs.flatMap((need) => need.options.map(subjectOf)));
    const queue = [...subjects].filter((subject) => {
      const key = `${subject}:${termCode}`;
      if (requested.current.has(key)) return false;
      requested.current.add(key);
      return true;
    });

    async function worker() {
      for (let subject = queue.shift(); subject; subject = queue.shift()) {
        const key = `${subject}:${termCode}`;
        let list: CourseCodeOption[] | null = null;
        try {
          list = await getCourseCodesForSubject(subject, termCode);
        } catch {
          // Leave null; the panel falls back to "can't check" for this subject.
        }
        setLists((previous) => new Map(previous).set(key, list));
      }
    }
    for (let i = 0; i < CONCURRENCY; i++) void worker();
  }, [audit, termCode]);

  function lookup(optionCode: string): OptionLookup {
    const list = lists.get(`${subjectOf(optionCode)}:${termCode}`);
    if (list === undefined) return { status: "loading" };
    if (list === null) return { status: "unknown" };
    if (optionCode.endsWith("@")) {
      const prefix = optionCode.slice(0, -1);
      return { status: "ok", courses: list.filter((course) => course.code.startsWith(prefix)) };
    }
    return { status: "ok", courses: list.filter((course) => course.code === optionCode) };
  }

  return lookup;
}
