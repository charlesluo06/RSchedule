// Reads the text of a UCR Degree Works audit and pulls out which courses are
// already taken and which are still needed. Pure string-in, data-out: the PDF
// reading lives in auditPdf.ts, and nothing here keeps the raw text, so the
// student's name/ID/advisor lines are never captured.
//
// Built against one real audit (CS major, 2024-25 catalog), so it keys on the
// patterns that are structural in Degree Works rather than on any one major:
//   "CS 100 ... A- 5 Fall 2025"            a completed course row
//   "CS 153 ... REG (4) Fall 2026"         an in-progress row (units in parens)
//   "1 Class in CS 152"                    a specific course still needed
//   "28 to 30 Units in CS 105 or 108 ..."  pick-from list (subject carries
//                                          across "or" until a new one appears)
//   "CS 179@"                              "@" = any course number
//   "Still Needed: Click here to see ..."  a requirement with no course list
//                                          (GE areas, ethnicity, depth)

export interface AuditNeed {
  // Line the requirement was found on, so the UI can keep the audit's own order.
  position: number;
  // Requirement name as printed in the audit (cosmetic; wrapped titles can
  // come out slightly off).
  label: string;
  // Block the requirement sits in, e.g. "Upper-division Computer Science Requirements".
  block: string;
  // Sub-heading inside the block when there is one, e.g. "ENGLISH COMPOSITION".
  group: string;
  kind: "classes" | "units";
  // "1" or "28 to 30" — how many classes/units are still needed.
  amount: string;
  // Normalized codes like "CS152"; a trailing "@" is a wildcard ("CS179@").
  options: string[];
}

// A requirement that's still open but that the audit gives no course list for
// (the audit just says "click here to see classes"). Shown as a plain note.
export interface OpenRequirement {
  position: number;
  label: string;
  block: string;
  group: string;
}

export interface ParsedAudit {
  needs: AuditNeed[];
  openRequirements: OpenRequirement[];
  taken: string[];
  inProgress: string[];
}

// The slice of a parsed audit worth keeping between visits: requirement names
// and course codes only. Taken courses, the PDF, and anything identifying the
// student are deliberately not part of it.
export type AuditData = Pick<ParsedAudit, "needs" | "openRequirements">;

export function toAuditData(parsed: ParsedAudit): AuditData {
  return { needs: parsed.needs, openRequirements: parsed.openRequirements };
}

const isString = (v: unknown): v is string => typeof v === "string";

// Stored JSON is untrusted (old app versions, hand-edited), so check the shape
// before the panel renders it.
export function isAuditData(v: unknown): v is AuditData {
  const a = v as AuditData | null;
  return (
    !!a &&
    Array.isArray(a.needs) &&
    a.needs.every(
      (n) =>
        !!n &&
        typeof n.position === "number" &&
        isString(n.label) &&
        isString(n.block) &&
        isString(n.group) &&
        (n.kind === "classes" || n.kind === "units") &&
        isString(n.amount) &&
        Array.isArray(n.options) &&
        n.options.every(isString),
    ) &&
    Array.isArray(a.openRequirements) &&
    a.openRequirements.every(
      (o) => !!o && typeof o.position === "number" && isString(o.label) && isString(o.block) && isString(o.group),
    )
  );
}

const TAKEN_ROW =
  /\b([A-Z]{2,5}) (\d{3}[A-Z]?)\b.*?\s([A-Z]{1,3}[+-]?)\s(\(?\d+(?:\.\d+)?\)?)\s(?:Fall|Winter|Spring|Summer) \d{4}$/;
const NEED = /(\d+(?:\s+to\s+\d+)?)\s+(Class(?:es)?|Units?)\s+in\s+(.+)$/;
const OPEN_REQUIREMENT = /Still Needed:\s*Click here to see classes which meet this requirement/;
// ALL-CAPS section line like "HUMANITIES" or "SOCIAL SCIENCES".
const GROUP_HEADING = /^[A-Z][A-Z &,-]{3,}$/;
const BLOCK_HEADING = /^(.+?)\s+(?:INCOMPLETE|IN-PROGRESS|COMPLETE)$/;
const COURSE_NUMBER = /^\d{3}[A-Z]?@?$/;
const SUBJECT = /^[A-Z]{2,5}$/;
// Grades that don't count as having taken the course. Everything else counts,
// including transfer/AP markers (TP, TA, ...) that vary by credit type.
const NOT_TAKEN_GRADES = new Set(["F", "NP", "W", "NC", "U"]);
const CONNECTOR_END = /\b(and|for|of|or|to|the|in|a)$|,$/i;

// Reads "CS 105 or 108 or EE 168" style option text. Stops at the first token
// that doesn't fit, so trailing prose can't leak in as fake courses.
function parseOptions(text: string): string[] {
  const codes: string[] = [];
  let subject = "";
  const tokens = text.split(" ");
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "or") continue;
    if (SUBJECT.test(token) && COURSE_NUMBER.test(tokens[i + 1] ?? "")) {
      subject = token;
    } else if (COURSE_NUMBER.test(token) && subject) {
      codes.push(subject + token);
    } else {
      break;
    }
  }
  return codes;
}

// A wrapped pick-from list continues on following lines made only of
// "or", course numbers, and subjects directly followed by a number.
function isOptionContinuation(line: string): boolean {
  const tokens = line.split(" ");
  return tokens.every((token, i) => {
    if (token === "or" || COURSE_NUMBER.test(token)) return true;
    return SUBJECT.test(token) && COURSE_NUMBER.test(tokens[i + 1] ?? "");
  });
}

export function parseAudit(text: string): ParsedAudit {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    // Page headers repeat the student's name/ID and can land in the middle of
    // a wrapped list, so drop them before anything else looks at the lines.
    .filter((line) => line !== "" && !line.startsWith("UCR Degree Works") && !line.startsWith("====="));

  const taken = new Set<string>();
  const inProgress = new Set<string>();
  const needs: AuditNeed[] = [];
  const openRequirements: OpenRequirement[] = [];
  let block = "";
  let group = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const heading = BLOCK_HEADING.exec(line);
    if (heading) {
      block = heading[1];
      group = "";
    } else if (GROUP_HEADING.test(line)) {
      // A heading that wraps ("ENGINEERING COURSE OUTSIDE OF" / "COMPUTER
      // SCIENCE") is one title, so extend it instead of replacing it.
      group = / (OF|AND)$/.test(group) && !group.includes("  ") ? `${group} ${line}` : line;
    }

    const row = TAKEN_ROW.exec(line);
    if (row) {
      const code = row[1] + row[2];
      const [, , , grade, units] = row;
      if (grade === "REG" || units.startsWith("(")) inProgress.add(code);
      else if (!NOT_TAKEN_GRADES.has(grade)) taken.add(code);
      continue;
    }

    const open = OPEN_REQUIREMENT.exec(line);
    if (open) {
      openRequirements.push({ position: i, label: findLabel(lines, i, open.index), block, group });
      continue;
    }

    const need = NEED.exec(line);
    if (!need) continue;
    // The GPA block repeats the major's requirement lists as one giant
    // superset; it's informational and would only duplicate the real blocks.
    if (/GPA/.test(block)) continue;

    let optionText = need[3];
    for (let j = i + 1; j < lines.length && isOptionContinuation(lines[j]); j++) {
      optionText += " " + lines[j];
    }

    needs.push({
      position: i,
      label: findLabel(lines, i, need.index),
      block,
      group,
      kind: need[2].toLowerCase().startsWith("class") ? "classes" : "units",
      amount: need[1].replace(/\s+/g, " "),
      options: parseOptions(optionText),
    });
  }

  // Pick-from lists include courses the student already has (the list is the
  // set of courses that *can* count), so drop those from the suggestions.
  const have = new Set([...taken, ...inProgress]);
  const remaining = needs
    .map((n) => ({ ...n, options: n.options.filter((code) => !have.has(code)) }))
    .filter((n) => n.options.length > 0);

  return { needs: remaining, openRequirements, taken: [...taken], inProgress: [...inProgress] };
}

// The requirement's name is either earlier on the same line, at the end of a
// completed-course row above ("Technical Electives CS 170 ..."), or on the
// line(s) above when the title wrapped.
function findLabel(lines: string[], index: number, needStart: number): string {
  const sameLine = lines[index].slice(0, needStart).replace(/Still Needed:/, "").trim();
  if (sameLine) return sameLine;

  const previous = lines[index - 1] ?? "";
  const rowAbove = TAKEN_ROW.exec(previous);
  if (rowAbove) return previous.slice(0, rowAbove.index).trim();

  // A one- or two-word line is almost always the tail of a wrapped title
  // ("...Course" / "Equivalent"), so pull the line above it in too.
  const isFragment = previous.split(" ").length <= 2 && !/\d/.test(previous);
  const parts = [previous];
  for (let k = index - 2; k >= 0; k--) {
    const joinsDown = CONNECTOR_END.test(lines[k]) || (isFragment && k === index - 2 && isPlainText(lines[k]));
    if (!joinsDown) break;
    parts.unshift(lines[k]);
  }
  return parts.join(" ");
}

function isPlainText(line: string): boolean {
  return !TAKEN_ROW.test(line) && !NEED.test(line) && !BLOCK_HEADING.test(line) && !/Still Needed|Satisfied by|^Course Title/.test(line);
}
