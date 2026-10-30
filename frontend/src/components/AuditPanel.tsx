import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseAudit, toAuditData } from "../lib/auditParser";
import type { AuditData, AuditNeed, OpenRequirement } from "../lib/auditParser";
import { readAuditPdf } from "../lib/auditPdf";
import { useOfferedCourses } from "../lib/useOfferedCourses";
import type { OptionLookup } from "../lib/useOfferedCourses";
import { MAX_COURSES } from "../lib/limits";
import { useModalFocus } from "../lib/useModalFocus";

interface AuditPanelProps {
  audit: AuditData | null;
  termCode: string;
  selectedCodes: string[];
  onAdd: (code: string) => void;
  onAuditChange: (audit: AuditData | null) => void;
  // True while the schedule is regenerating, so Add is paused instead of
  // letting two regenerations race each other.
  loading: boolean;
  onClose: () => void;
}

// "CS152" -> "CS 152", how students read course codes.
function formatCode(code: string): string {
  return code.replace(/^([A-Z]+)/, "$1 ");
}

// "SOCIAL SCIENCES" -> "Social Sciences"
function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

interface Block {
  title: string;
  position: number;
  needs: AuditNeed[];
  open: OpenRequirement[];
}

// Blocks in the order the audit lists them. Within a block the needs are
// split the way students think about them: classes you must take, then lists
// you choose from, then requirements the audit gives no course list for.
function groupByBlock(audit: AuditData): Block[] {
  const blocks = new Map<string, Block>();
  const blockFor = (title: string, position: number) => {
    let block = blocks.get(title);
    if (!block) {
      block = { title, position, needs: [], open: [] };
      blocks.set(title, block);
    }
    block.position = Math.min(block.position, position);
    return block;
  };
  for (const need of audit.needs) blockFor(need.block, need.position).needs.push(need);
  for (const open of audit.openRequirements) blockFor(open.block, open.position).open.push(open);
  return [...blocks.values()].sort((a, b) => a.position - b.position);
}

const isRequired = (need: AuditNeed) => need.kind === "classes" && need.options.length === 1;

// What the rows below need from the panel. Passed down as props (instead of
// the rows being defined inside AuditPanel) so React keeps them mounted
// across re-renders, which keeps the "not offered" fold-outs from snapping shut.
interface RowContext {
  selectedCodes: string[];
  atLimit: boolean;
  busy: boolean;
  onAdd: (code: string) => void;
  lookup: (code: string) => OptionLookup;
}

function CourseRow({ code, title, ctx }: { code: string; title?: string; ctx: RowContext }) {
  const added = ctx.selectedCodes.includes(code);
  return (
    <li className="flex items-center justify-between gap-2 py-1">
      <span className="min-w-0">
        <span className="text-sm font-medium text-neutral-900">{formatCode(code)}</span>
        {title && <span className="block truncate text-xs text-neutral-500">{title}</span>}
      </span>
      <button
        type="button"
        onClick={() => ctx.onAdd(code)}
        disabled={added || ctx.atLimit || ctx.busy}
        title={ctx.atLimit && !added ? `You can schedule up to ${MAX_COURSES} courses` : undefined}
        className="shrink-0 cursor-pointer rounded-lg border border-neutral-300 px-2 py-0.5 text-xs font-medium
                   text-neutral-700 transition-colors hover:bg-neutral-100
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        {added ? "Added" : "+ Add"}
      </button>
    </li>
  );
}

// One requirement's options, with Add buttons only for what's offered this
// term. Courses that aren't offered are tucked into a collapsed note.
function Options({ need, ctx }: { need: AuditNeed; ctx: RowContext }) {
  const lookups: [string, OptionLookup][] = need.options.map((code) => [code, ctx.lookup(code)]);
  if (lookups.some(([, l]) => l.status === "loading")) {
    return <p className="mt-1 text-xs text-neutral-500">Checking what&apos;s offered this term…</p>;
  }

  const offered = lookups.flatMap(([, l]) => (l.status === "ok" ? l.courses : []));
  const unchecked = lookups.filter(([, l]) => l.status === "unknown").map(([code]) => code);
  const notOffered = lookups.filter(([, l]) => l.status === "ok" && l.courses.length === 0).map(([code]) => code);

  return (
    <>
      {offered.length + unchecked.length === 0 && <p className="mt-1 text-xs text-neutral-500">Not offered this term.</p>}
      <ul>
        {offered.map((course) => (
          <CourseRow key={course.code} code={course.code} title={course.title} ctx={ctx} />
        ))}
        {unchecked.map((code) => (
          <CourseRow key={code} code={code} ctx={ctx} />
        ))}
      </ul>
      {unchecked.length > 0 && (
        <p className="text-xs text-neutral-500">Couldn&apos;t check whether these are offered this term.</p>
      )}
      {notOffered.length > 0 && offered.length + unchecked.length > 0 && (
        <details className="mt-1 text-xs text-neutral-500">
          <summary className="cursor-pointer">{notOffered.length} not offered this term</summary>
          <p className="mt-1">{notOffered.map(formatCode).join(", ")}</p>
        </details>
      )}
    </>
  );
}

const CHIP = "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium";
const CHIP_REQUIRED = `${CHIP} bg-green-100 text-green-800`;
const CHIP_CHOOSE = `${CHIP} bg-amber-100 text-amber-800`;
const CHIP_OPEN = `${CHIP} bg-neutral-100 text-neutral-600`;

function NeedItem({ need, ctx }: { need: AuditNeed; ctx: RowContext }) {
  const heading = isRequired(need)
    ? "Take this"
    : need.kind === "units"
      ? `Choose ${need.amount} units`
      : `Choose ${need.amount} ${need.amount === "1" ? "class" : "classes"}`;
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-neutral-900">{need.label}</h4>
        <span className={isRequired(need) ? CHIP_REQUIRED : CHIP_CHOOSE}>{heading}</span>
      </div>
      <Options need={need} ctx={ctx} />
    </div>
  );
}

// First-time view, before any audit is loaded: a small centered modal over a
// blurred backdrop (same look as the class and legal modals) that explains
// how the feature works. Once an audit is loaded the full requirements panel
// takes over.
function AuditIntroModal({
  busy,
  error,
  onPick,
  onClose,
}: {
  busy: boolean;
  error: string | null;
  onPick: (file: File) => void;
  onClose: () => void;
}) {
  const dialogRef = useModalFocus<HTMLDivElement>();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-white/30 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="animate-fade-in w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl
                   ring-1 ring-black/5 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-intro-title"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="audit-intro-title" className="text-lg font-semibold text-primary-700">
            Degree audit
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

        <p className="mt-1 text-sm text-neutral-600">See the classes you still need to take.</p>

        <ol className="mt-4 flex flex-col gap-2 text-sm text-neutral-700">
          <li>1. Download your degree audit from Degree Works as a PDF.</li>
          <li>2. Upload it here. It&apos;s read in your browser and never uploaded.</li>
          <li>3. See what&apos;s left by requirement, and add the classes offered this term.</li>
        </ol>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onPick(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="mt-5 w-full cursor-pointer rounded-xl bg-accent-500 px-4 py-2.5 font-semibold text-primary-900
                     transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Reading…" : "Upload audit PDF"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function AuditPanel({ audit, termCode, selectedCodes, onAdd, onAuditChange, loading, onClose }: AuditPanelProps) {
  const lookup = useOfferedCourses(audit, termCode);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const parsed = parseAudit(await readAuditPdf(file));
      const foundAnything =
        parsed.needs.length + parsed.openRequirements.length + parsed.taken.length + parsed.inProgress.length > 0;
      if (!foundAnything) {
        throw new Error("That doesn't look like a UCR degree audit. Download your audit as a PDF and try again.");
      }
      onAuditChange(toAuditData(parsed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  if (!audit) {
    return <AuditIntroModal busy={busy} error={error} onPick={(file) => void handleFile(file)} onClose={onClose} />;
  }

  const ctx: RowContext = { selectedCodes, atLimit: selectedCodes.length >= MAX_COURSES, busy: loading, onAdd, lookup };

  return (
    <aside
      aria-label="Degree audit requirements"
      className="fixed inset-x-3 bottom-3 z-30 flex max-h-[75svh] flex-col overflow-hidden rounded-2xl border
                 border-neutral-200 bg-white shadow-xl ring-1 ring-black/5
                 lg:inset-x-auto lg:inset-y-4 lg:right-4 lg:max-h-none lg:w-96"
    >
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-4">
        <div>
          <h2 className="text-lg font-semibold text-primary-700">Degree audit</h2>
          <p className="text-xs text-neutral-500">What you still need, from your uploaded audit.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close degree audit"
          className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-neutral-50 p-4">
        {error && (
          <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

          <>
            <div className="flex flex-col gap-5">
            {groupByBlock(audit).map((block) => {
              const required = block.needs.filter(isRequired);
              const choices = block.needs.filter((need) => !isRequired(need));
              return (
                <section
                  key={block.title}
                  className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2 bg-primary-500 px-3 py-2 text-white">
                    <h3 className="text-sm font-semibold">{block.title}</h3>
                    <span className="shrink-0 text-xs text-white/80">{block.needs.length + block.open.length} needed</span>
                  </div>
                  <div className="divide-y divide-neutral-100 px-3">
                    {required.map((need) => (
                      <NeedItem key={need.position} need={need} ctx={ctx} />
                    ))}
                    {choices.map((need) => (
                      <NeedItem key={need.position} need={need} ctx={ctx} />
                    ))}
                    {block.open.map((requirement) => (
                      <div key={requirement.position} className="flex items-start justify-between gap-2 py-3">
                        <div>
                          {requirement.group && (
                            <p className="text-xs font-medium text-neutral-500">{titleCase(requirement.group)}</p>
                          )}
                          <p className="text-sm text-neutral-900">{requirement.label}</p>
                        </div>
                        <span className={CHIP_OPEN}>Still needed</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
            </div>
            {audit.needs.length + audit.openRequirements.length === 0 && (
              <p className="text-sm text-neutral-700">
                Nothing left to take according to this audit. Double-check it with your advisor.
              </p>
            )}
            <p className="mt-4 text-xs text-neutral-500">
              Based only on what your audit lists. Prerequisites aren&apos;t checked, so confirm in UCR&apos;s system.
            </p>
          </>
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-100 p-4">
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="cursor-pointer rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-semibold text-primary-900
                     transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Reading…" : "Replace audit"}
        </button>
        <button
          type="button"
          onClick={() => {
            onAuditChange(null);
            setError(null);
          }}
          className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium
                     text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          Clear audit
        </button>
      </div>
    </aside>
  );
}

export default AuditPanel;
