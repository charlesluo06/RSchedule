const GUARANTEES = ["No overlapping classes", "Only sections with open seats"];

// Back to two separate lines, but no color-coding this time — the same
// neutral checkmark icon for both, since these are just two facts, not two
// different categories that need to be told apart.
function LockedConstraintPills() {
  return (
    <div className="flex flex-col gap-2">
      {GUARANTEES.map((label) => (
        <span key={label} aria-disabled="true" className="flex items-center gap-2 text-sm text-neutral-700">
          <svg
            viewBox="0 0 20 20"
            className="h-4 w-4 shrink-0 text-neutral-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="8" />
            <path d="M6.5 10l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}

export default LockedConstraintPills;
