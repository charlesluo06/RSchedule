import { useState, type CSSProperties } from "react";
import { copyText } from "../lib/clipboard";

interface CopyCrnButtonProps {
  crn: string;
  className?: string;
  style?: CSSProperties;
}

// Small icon-only copy control for a single CRN (students add classes one at
// a time in UCR's registration search). Swaps to a check for a moment after a
// successful copy. Stops click propagation so that, when it sits on top of a
// calendar block, copying never also opens the class detail modal.
function CopyCrnButton({ crn, className = "", style }: CopyCrnButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (await copyText(crn)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      type="button"
      data-no-export
      onClick={handleClick}
      title={copied ? "Copied!" : `Copy CRN ${crn}`}
      aria-label={copied ? "Copied CRN" : `Copy CRN ${crn}`}
      className={`inline-flex cursor-pointer items-center justify-center gap-1 rounded text-[10px] leading-none font-semibold ${className}`}
      style={style}
    >
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {copied ? (
          <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <rect x="7" y="7" width="10" height="10" rx="2" />
            <path d="M13 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2" strokeLinecap="round" />
          </>
        )}
      </svg>
      {copied ? "Copied" : "CRN"}
    </button>
  );
}

export default CopyCrnButton;
