import CopyCrnButton from "./CopyCrnButton";

interface ArrangedSection {
  courseCode: string;
  sectionType: string;
  crn: string;
}

interface ArrangedNoteProps {
  sections: ArrangedSection[];
}

// Sections with no fixed meeting time (arranged/async, e.g. an online lab)
// can't be placed on the grid at all — there's no day or time to position
// them by. Listing them here instead of silently dropping them makes sure
// the student still knows this section exists and needs to be registered for.
function ArrangedNote({ sections }: ArrangedNoteProps) {
  if (sections.length === 0) return null;

  return (
    <div className="mt-3 border-t border-dashed border-neutral-300 pt-3 text-sm text-neutral-600">
      {sections.map((s) => (
        <p key={s.crn} className="flex items-center gap-1.5">
          <span>
            {s.courseCode} {s.sectionType} (CRN {s.crn}) — arranged/online, no fixed meeting time
          </span>
          <CopyCrnButton crn={s.crn} className="px-1.5 py-1 text-neutral-500 hover:bg-neutral-100 hover:text-primary-700" />
        </p>
      ))}
    </div>
  );
}

export default ArrangedNote;
