import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { BusyBlock, DayOfWeek } from "../types";
import DayToggleRow from "./DayToggleRow";
import TimeRangeSlider from "./TimeRangeSlider";

interface BusyBlockModalProps {
  onAdd: (block: BusyBlock) => void;
  onClose: () => void;
}

// Real UCR class start times only ever land on :00 or :30 (confirmed
// against live data across 2,300+ sections, zero exceptions) — and the
// busy-block time picker itself snaps to that same 30-minute grid, so the
// gap between a block ending and the next class starting is always either
// 0 minutes or 30+. That means any buffer value from 1-29 minutes produces
// the exact same scheduling outcome (it only ever matters for the 0-gap
// case) — a granular 10m/15m/30m choice was offering a distinction that
// doesn't exist. A plain on/off toggle is the honest version of this
// control; 10 minutes (matching UCR's own real back-to-back class gap) is
// the only number "on" needs to mean.
const BUFFER_MINUTES_WHEN_ON = 10;

// A fresh, empty draft every time the modal opens — no in-place editing in
// v1 (matches the user's own description of the flow: remove the chip via
// its × and re-add if you want to change something, rather than a second
// "edit" mode this modal would need to support).
function makeDraft(): { label: string; days: DayOfWeek[]; startTime: string; endTime: string; bufferMinutes: number } {
  // On by default — most people forget to opt into a safety margin, and
  // losing 10 minutes right after a busy block rarely costs real
  // availability given classes are already 30 minutes apart at minimum.
  return { label: "", days: [], startTime: "12:00", endTime: "14:00", bufferMinutes: BUFFER_MINUTES_WHEN_ON };
}

// Built on the exact same shell as LegalModal — portal to <body>, Escape to
// close, scroll lock while open, click-outside-to-dismiss — since this is
// the second modal in the app and there's no reason to reinvent that.
function BusyBlockModal({ onAdd, onClose }: BusyBlockModalProps) {
  const [draft, setDraft] = useState(makeDraft);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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

  const canApply = draft.days.length > 0 && draft.startTime < draft.endTime;

  function handleApply() {
    if (!canApply) return;
    onAdd({
      id: crypto.randomUUID(),
      label: draft.label.trim() || "Busy",
      days: draft.days,
      startTime: draft.startTime,
      endTime: draft.endTime,
      bufferMinutes: draft.bufferMinutes,
    });
    onClose();
  }

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
        aria-labelledby="busy-block-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="busy-block-modal-title" className="text-lg font-semibold text-primary-700">
            Add busy time
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

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="busy-block-label" className="text-sm font-medium text-primary-700">
              Label
            </label>
            <input
              id="busy-block-label"
              type="text"
              value={draft.label}
              onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="e.g. Work"
              maxLength={40}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-neutral-900
                         placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-primary-700">Days</span>
            <DayToggleRow value={draft.days} onChange={(days) => setDraft((prev) => ({ ...prev, days }))} />
          </div>

          <TimeRangeSlider
            label="Time"
            startTime={draft.startTime}
            endTime={draft.endTime}
            onChange={(startTime, endTime) => setDraft((prev) => ({ ...prev, startTime, endTime }))}
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-primary-700">Passing Period</span>
              <button
                type="button"
                role="switch"
                aria-checked={draft.bufferMinutes > 0}
                aria-label="Passing Period"
                onClick={() =>
                  setDraft((prev) => ({ ...prev, bufferMinutes: prev.bufferMinutes > 0 ? 0 : BUFFER_MINUTES_WHEN_ON }))
                }
                className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                  draft.bufferMinutes > 0 ? "bg-primary-500" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    draft.bufferMinutes > 0 ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              Classes can't start within {BUFFER_MINUTES_WHEN_ON} minutes of this block ending.
            </p>
          </div>

          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="mt-2 w-full cursor-pointer rounded-xl bg-primary-500 px-4 py-2.5 font-semibold text-white
                       transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
          {draft.days.length === 0 && (
            <p className="-mt-2 text-xs text-neutral-500">Pick at least one day to apply this block.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default BusyBlockModal;
