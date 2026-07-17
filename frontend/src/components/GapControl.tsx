import type { GapPreference } from "../types";

interface GapControlProps {
  value: GapPreference;
  onChange: (value: GapPreference) => void;
}

const OPTIONS: { value: GapPreference; label: string }[] = [
  { value: "minimize", label: "Packed" },
  { value: "none", label: "Any" },
  { value: "maximize", label: "Spread" },
];

function GapControl({ value, onChange }: GapControlProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-primary-700">Gaps between classes</span>
      <div className="inline-flex rounded-xl border border-neutral-200 bg-white p-1">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              value === option.value
                ? "bg-primary-500 text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default GapControl;
