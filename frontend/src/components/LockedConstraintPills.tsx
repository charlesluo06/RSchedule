const LOCKED_CONSTRAINTS = [
  "No overlapping classes",
  "Linked sections stay together",
  "Only sections with open seats",
];

// These aren't controls — they're always true, so there's nothing to toggle.
// Shown so the user knows these guarantees exist without implying they're
// adjustable (no hover state, no click handler, aria-disabled for clarity).
function LockedConstraintPills() {
  return (
    <div className="flex flex-wrap gap-2">
      {LOCKED_CONSTRAINTS.map((constraint) => (
        <span
          key={constraint}
          aria-disabled="true"
          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700"
        >
          <span aria-hidden="true">🔒</span>
          {constraint}
        </span>
      ))}
    </div>
  );
}

export default LockedConstraintPills;
