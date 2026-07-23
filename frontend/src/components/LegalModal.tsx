import { useEffect } from "react";
import { createPortal } from "react-dom";

interface LegalModalProps {
  onClose: () => void;
}

function LegalModal({ onClose }: LegalModalProps) {
  // Escape closes the modal, same as clicking outside it — a modal that
  // only responds to one dismissal method is a small but real usability gap.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Lock page scroll while the modal is open, same reasoning as
  // ClassDetailModal — restored on close/unmount.
  useEffect(() => {
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  // Portal straight into <body>, same reasoning as ClassDetailModal — avoids
  // any backdrop-filter ancestor turning "fixed inset-0" into something that
  // centers on the wrong box.
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-white/30 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-fade-in w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl
                   ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="legal-modal-title" className="text-lg font-semibold text-primary-700">
            Legal
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4 text-sm text-neutral-700">
          <div>
            <h3 className="mb-1 font-medium text-primary-700">Not affiliated with UCR</h3>
            <p>
              RSchedule is an independent student project and is not affiliated with, endorsed by, or sponsored by
              the University of California, Riverside (UCR).
            </p>
          </div>
          <div>
            <h3 className="mb-1 font-medium text-primary-700">No warranty</h3>
            <p>
              RSchedule pulls data directly from UCR's registration system, but seat counts, offered sections, and
              meeting times can change at any time. This tool is provided as-is, without warranty of any kind —
              always verify your schedule and registration details through UCR's official registration portal.
              RSchedule is not responsible for missed deadlines, registration errors, or other outcomes related to
              your course registration.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default LegalModal;
