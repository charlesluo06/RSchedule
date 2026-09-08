import { useState } from "react";
import type { BusyBlock, DayOfWeek } from "../types";
import { DAY_ORDER, formatClock } from "../lib/time";
import BusyBlockModal from "./BusyBlockModal";

interface BusyBlocksEditorProps {
  blocks: BusyBlock[];
  onChange: (blocks: BusyBlock[]) => void;
  // The setup form uses this left-aligned (matching every other left-aligned
  // control on that card); the results-page PreferencesBar panel wants it
  // horizontally centered instead, since it's a standalone side-by-side
  // panel rather than one item in a top-to-bottom list.
  align?: "left" | "center";
}

const DAY_ABBR: Record<DayOfWeek, string> = { Mon: "M", Tue: "Tu", Wed: "W", Thu: "Th", Fri: "F" };

// "MWF" / "TuTh" style — abbreviates Tue/Thu to 2 letters specifically so
// they're never ambiguous with each other when concatenated.
function formatDays(days: DayOfWeek[]): string {
  return DAY_ORDER.filter((d) => days.includes(d))
    .map((d) => DAY_ABBR[d])
    .join("");
}

// Deliberately NOT an always-visible inline editor — the user specifically
// wanted a "Customize" button that opens a modal to author one block at a
// time, with applied blocks then living as removable chips (reusing
// CourseChipInput's exact pale chip styling) rather than a taller form
// permanently occupying space on the setup card.
function BusyBlocksEditor({ blocks, onChange, align = "left" }: BusyBlocksEditorProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const centered = align === "center";

  function addBlock(block: BusyBlock) {
    onChange([...blocks, block]);
  }

  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  return (
    <div className={`flex flex-col gap-1.5 ${centered ? "items-center text-center" : ""}`}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold text-primary-700">Busy times</span>
        <span className="text-xs text-neutral-400 italic">Work, practice, etc.</span>
      </div>

      {blocks.length > 0 && (
        <div className={`flex flex-wrap gap-2 ${centered ? "justify-center" : ""}`}>
          {blocks.map((block) => (
            <span
              key={block.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1
                         text-sm font-medium text-primary-700"
            >
              {block.label} · {formatDays(block.days)} · {formatClock(block.startTime)}–{formatClock(block.endTime)}
              <button
                type="button"
                onClick={() => removeBlock(block.id)}
                aria-label={`Remove ${block.label}`}
                className="cursor-pointer text-primary-500 hover:text-primary-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium
                   text-neutral-700 transition-colors hover:bg-neutral-100
                   ${centered ? "self-center" : "self-start"}`}
      >
        + Customize busy times
      </button>

      {modalOpen && <BusyBlockModal onAdd={addBlock} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

export default BusyBlocksEditor;
