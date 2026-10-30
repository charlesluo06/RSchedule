import { describe, expect, it } from "vitest";
import { isAuditData, parseAudit, toAuditData } from "./auditParser";

// Hand-written to match how pdf.js lays out a Degree Works audit (one text
// line per row, cells joined by spaces). Fake student, real structure.
const FIXTURE = `
UCR Degree Works Doe, Jane A - 100000000
Student Name: Doe, Jane A
Student ID: 100000000
Degree in Bachelor of Science INCOMPLETE
Still Needed: 180 units are required. You currently have 149.5, you still need 30.5 more
units.
Breadth for Bourns College of Engineering INCOMPLETE
Course Title Grade Units Term
ENGLISH COMPOSITION
Beginning Composition ENGL 001A BEGINNING COMPOSITION C+ 4 Winter 2025
Intermediate Composition Still Needed: 1 Class in WRIT 020 or 020S
ENGL 001C or WAC Still Needed: Choose from 1 of the following:
Applied Intermediate Composition 1 Class in WRIT 030 or 030S
Writing Across the Curriculum Course
Equivalent
1 Class in ANTH 001W or DNCE 007W or ENGR 180W or
181W or POSC 005W or 010W or RLST 007W or 012W
HUMANITIES
Hum-A. World History HIST --WH WORLD HISTORY:TRANSFER TP 4 Spring 2022
Satisfied by: AP9303 - WORLD HISTORY - Educational Testing Service:AP
Hum-C. Human Perspectives on Science &
Technology
Still Needed: Click here to see classes which meet this requirement
SOCIAL SCIENCES
SS-C. General Social Science Still Needed: Click here to see classes which meet this requirement
Ethnicity Requirement Still Needed: Click here to see classes which meet this requirement
DEPTH for Bourns College of Engineering INCOMPLETE
DEPTH Courses PHIL 111 PHIL, FILM, REFLECTV POP CLTR A- 4 Summer 2026
Still Needed: Click here to see classes which meet this requirement
Lower-division Computer Science Requirements IN-PROGRESS
Intro to Computer Science for Sci, Math, and Engr I CS 010A INTRO: CS FOR SCI,MATH&ENGR I B+ 4 Fall 2024
Intro to College Math for the Sciences or First Year
Calculus
MATH 009A FIRST-YEAR CALCULUS TP 4 Spring 2024
Satisfied by: AP6903 - CALCULUS AB SUBGRADE - Educational Testing Service:AP
UCR Degree Works Doe, Jane A - 100000000
Upper-division Computer Science Requirements INCOMPLETE
Professional Development and Mentoring Still Needed: 1 Class in ENGR 101I
Software Construction CS 100 SOFTWARE CONSTRUCTION A- 5 Fall 2025
Discrete Structures CS 111 DISCRETE STRUCTURES F 4 Winter 2026
Intro Psychology PSYC 002 INTRODUCTORY PSYCHOLOGY TA 4.5 Summer 2025
Compiler Design Still Needed: 1 Class in CS 152
Design of Operating Systems CS 153 DESIGN OF OPERATING SYSTEMS REG (4) Fall 2026
Project in Computer Science Still Needed: 1 Class in CS 179@
Probability and Statistics for Science and
Engineering
Still Needed: 1 Class in STAT 155
Technical Electives CS 170 INTRO TO ARTIFCAL INTELLIGENCE REG (4) Fall 2026
Still Needed: 28 to 30 Units in CS 105 or 108 or 110 or 153 or 170 or
133 or 135 or 179@ or 193 or
UCR Degree Works Doe, Jane A - 100000000
or EE 168 or MATH 120 or 126 or PHIL 124
Upper-division Computer Science Major GPA INCOMPLETE
Upper-division Computer Science Major Courses CS 100 SOFTWARE CONSTRUCTION A- 5 Fall 2025
Still Needed: 45 to 182 Units in CS 105 or 108 or 110 or EE 120B or STAT 155
In-progress Units Applied: 13 Classes Applied: 3
ECON 005 DATA ANALYSIS FOR ECON & BUS REG (5) Fall 2026
`;

describe("parseAudit", () => {
  const result = parseAudit(FIXTURE);
  const need = (label: string) => result.needs.find((n) => n.label === label);

  it("separates completed from in-progress courses", () => {
    expect(result.taken).toEqual(expect.arrayContaining(["ENGL001A", "CS010A", "CS100", "MATH009A"]));
    expect(result.inProgress.sort()).toEqual(["CS153", "CS170", "ECON005"]);
    expect(result.taken).not.toContain("CS153");
    // Transfer-articulated grades count; a failing grade doesn't.
    expect(result.taken).toContain("PSYC002");
    expect(result.taken).not.toContain("CS111");
  });

  it("reads single-course needs", () => {
    expect(need("Professional Development and Mentoring")?.options).toEqual(["ENGR101I"]);
    expect(need("Compiler Design")?.options).toEqual(["CS152"]);
    expect(need("Project in Computer Science")?.options).toEqual(["CS179@"]);
  });

  it("carries the subject across 'or' and across wrapped lines", () => {
    expect(need("Intermediate Composition")?.options).toEqual(["WRIT020", "WRIT020S"]);
    expect(need("Applied Intermediate Composition")?.options).toEqual(["WRIT030", "WRIT030S"]);
    expect(need("Writing Across the Curriculum Course Equivalent")?.options).toEqual([
      "ANTH001W", "DNCE007W", "ENGR180W", "ENGR181W", "POSC005W", "POSC010W", "RLST007W", "RLST012W",
    ]);
  });

  it("joins a wrapped title", () => {
    expect(need("Probability and Statistics for Science and Engineering")?.options).toEqual(["STAT155"]);
  });

  it("reads a pick-from list across lines and a page header, minus courses already taken", () => {
    const electives = need("Technical Electives");
    expect(electives?.kind).toBe("units");
    expect(electives?.amount).toBe("28 to 30");
    // CS153 and CS170 are in progress, so they're not suggested.
    expect(electives?.options).toEqual([
      "CS105", "CS108", "CS110", "CS133", "CS135", "CS179@", "CS193", "EE168", "MATH120", "MATH126", "PHIL124",
    ]);
  });

  it("lists requirements with no course list as open requirements, not suggestions", () => {
    expect(result.openRequirements).toMatchObject([
      { label: "Hum-C. Human Perspectives on Science & Technology", block: "Breadth for Bourns College of Engineering", group: "HUMANITIES" },
      { label: "SS-C. General Social Science", block: "Breadth for Bourns College of Engineering", group: "SOCIAL SCIENCES" },
      { label: "Ethnicity Requirement", block: "Breadth for Bourns College of Engineering", group: "SOCIAL SCIENCES" },
      { label: "DEPTH Courses", block: "DEPTH for Bourns College of Engineering", group: "" },
    ]);
    expect(result.needs.map((n) => n.label)).not.toContain("Hum-C. Human Perspectives on Science & Technology");
  });

  it("records the sub-heading each need sits under", () => {
    expect(need("Intermediate Composition")?.group).toBe("ENGLISH COMPOSITION");
  });

  it("ignores totals and the GPA block duplicate", () => {
    expect(result.needs.every((n) => !/GPA/.test(n.block))).toBe(true);
    expect(result.needs).toHaveLength(8);
  });

  it("never captures the student's identity", () => {
    const dump = JSON.stringify(result);
    expect(dump).not.toMatch(/Doe|Jane|100000000/);
  });

  it("keeps only requirement data for storage, and validates it on the way back", () => {
    const stored = toAuditData(result);
    expect(Object.keys(stored).sort()).toEqual(["needs", "openRequirements"]);
    expect(isAuditData(JSON.parse(JSON.stringify(stored)))).toBe(true);
    expect(isAuditData({ needs: [{ label: 5 }], openRequirements: [] })).toBe(false);
    expect(isAuditData(null)).toBe(false);
  });

  it("returns nothing for text that isn't an audit", () => {
    expect(parseAudit("hello world")).toEqual({ needs: [], openRequirements: [], taken: [], inProgress: [] });
  });
});
