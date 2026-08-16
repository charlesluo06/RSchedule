import { useState } from "react";
import type { Term } from "../types";

interface TermDropdownProps {
  terms: Term[];
  selectedTermCode: string;
  onChange: (code: string) => void;
  loading: boolean;
  error: string | null;
}

// Styled to match CourseChipInput's autofill dropdown exactly (same
// input/button chrome, same list chrome, same onMouseDown-before-blur
// selection trick) rather than a native <select> — browsers don't let you
// restyle a native select's popup to match custom-built dropdowns elsewhere
// in the app, so this reimplements it as a button + list instead.
function TermDropdown({ terms, selectedTermCode, onChange, loading, error }: TermDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading terms…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  const selectedTerm = terms.find((t) => t.code === selectedTermCode);

  function selectTerm(code: string) {
    onChange(code);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % terms.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + terms.length) % terms.length);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectTerm(terms[highlightedIndex].code);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-primary-700">Term</span>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            const selectedIndex = terms.findIndex((t) => t.code === selectedTermCode);
            setHighlightedIndex(selectedIndex === -1 ? 0 : selectedIndex);
            setIsOpen((open) => !open);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setIsOpen(false)}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-neutral-200
                     bg-white px-3 py-2 text-left text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <span className="truncate">{selectedTerm?.description ?? "Select a term"}</span>
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {isOpen && (
          <ul
            role="listbox"
            className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-neutral-200
                       bg-white py-1 shadow-lg"
          >
            {terms.map((term, index) => (
              <li key={term.code}>
                <button
                  type="button"
                  // onMouseDown (not onClick) fires before the trigger's
                  // onBlur closes the dropdown — onClick would arrive too late.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectTerm(term.code);
                  }}
                  role="option"
                  aria-selected={term.code === selectedTermCode}
                  className={`w-full cursor-pointer px-3 py-1.5 text-left text-sm font-medium text-neutral-900 ${
                    index === highlightedIndex ? "bg-primary-50" : "hover:bg-neutral-50"
                  }`}
                >
                  {term.description}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default TermDropdown;
