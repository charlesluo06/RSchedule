// Turns messy user input like " cs 010 " into "CS010" — the shape the
// backend's /courses endpoint expects (it splits this into subject "CS" and
// number "010" using a regex on the leading letters).
export function normalizeCourseCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "");
}
