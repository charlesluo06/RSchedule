export interface CourseColor {
  bg: string;
  text: string;
  border: string;
}

// A fixed, hand-picked set of distinct hues — soft enough to sit calmly
// under the navy/gold UI chrome, but different enough from each other that
// 5-6 courses on one calendar stay easy to tell apart at a glance.
const PALETTE: CourseColor[] = [
  { bg: "#DBEAFE", text: "#1E3A8A", border: "#93C5FD" }, // blue
  { bg: "#CCFBF1", text: "#0F766E", border: "#5EEAD4" }, // teal
  { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" }, // amber
  { bg: "#FFE4E6", text: "#9F1239", border: "#FDA4AF" }, // rose
  { bg: "#EDE9FE", text: "#5B21B6", border: "#C4B5FD" }, // violet
  { bg: "#DCFCE7", text: "#166534", border: "#86EFAC" }, // green
];

// Courses beyond the palette's length wrap back around to the start (%)
// rather than crashing or running out of colors.
export function courseColorForIndex(index: number): CourseColor {
  return PALETTE[index % PALETTE.length];
}
