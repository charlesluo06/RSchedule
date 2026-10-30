import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "../lib/useModalFocus";

interface LegalModalProps {
  onClose: () => void;
}

function LegalModal({ onClose }: LegalModalProps) {
  const dialogRef = useModalFocus<HTMLDivElement>();
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
        className="animate-fade-in max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl
                   ring-1 ring-black/5 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        tabIndex={-1}
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
              RSchedule is an independent student project, not affiliated with, endorsed by, or sponsored by UC
              Riverside (UCR).
            </p>
          </div>
          <div>
            <h3 className="mb-1 font-medium text-primary-700">Check before you register</h3>
            <p>
              Seat counts, sections, and times come from UCR's registration system and can be out of date or change
              at any time. RSchedule is provided as-is, without warranty. Always confirm your schedule and register
              through UCR's official portal. RSchedule isn't responsible for missed deadlines, full classes, or other
              registration outcomes.
            </p>
          </div>
          <div>
            <h3 className="mb-1 font-medium text-primary-700">Your data</h3>
            <p>
              No accounts, and RSchedule never asks for your UCR login. Your courses, hours, busy times, and degree
              audit requirements are saved in your browser only. Courses and times are sent to our server just to
              build your schedule and aren't stored. An uploaded audit PDF is read in your browser and never
              uploaded, and your name and student ID are not kept. Your IP address is used briefly to limit abuse,
              and our host may keep standard server logs. We count page views with cookie-free analytics. If the app
              crashes, an anonymous error report (the error and your browser type, never your courses or schedule)
              may be sent.
            </p>
          </div>
          <p className="border-t border-neutral-100 pt-3 text-xs text-neutral-500">
            Made by Charles Luo.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default LegalModal;
