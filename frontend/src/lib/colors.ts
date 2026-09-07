export interface CourseColor {
  bg: string;
  text: string;
  border: string;
  // A bright, mid-saturation tone for the same hue — distinct from `text`
  // (which is a dark shade meant to sit ON TOP of the light `bg`, used for
  // chips/badges elsewhere). `solid` is meant to BE a background itself
  // (the calendar block), so it needs a punchier, more vibrant value than
  // `text` would give — that dark shade would read as heavy/dark, not vivid.
  solid: string;
}

// A fixed, hand-picked set of distinct hues — soft enough to sit calmly
// under the navy/gold UI chrome, but different enough from each other that
// 5-6 courses on one calendar stay easy to tell apart at a glance.
const PALETTE: CourseColor[] = [
  { bg: "#DBEAFE", text: "#1E3A8A", border: "#93C5FD", solid: "#3B82F6" }, // blue
  { bg: "#CCFBF1", text: "#0F766E", border: "#5EEAD4", solid: "#14B8A6" }, // teal
  { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D", solid: "#F59E0B" }, // amber
  { bg: "#FFE4E6", text: "#9F1239", border: "#FDA4AF", solid: "#FB7185" }, // rose
  { bg: "#EDE9FE", text: "#5B21B6", border: "#C4B5FD", solid: "#8B5CF6" }, // violet
  { bg: "#DCFCE7", text: "#166534", border: "#86EFAC", solid: "#22C55E" }, // green
];

// Courses beyond the palette's length wrap back around to the start (%)
// rather than crashing or running out of colors.
export function courseColorForIndex(index: number): CourseColor {
  return PALETTE[index % PALETTE.length];
}
